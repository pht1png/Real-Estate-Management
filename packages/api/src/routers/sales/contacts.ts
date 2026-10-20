import { contact, customerPayment, lead, reservation, salesContract } from "@real-estate-management/db/schema/index"
import { and, count, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import {
  conflict,
  contactName,
  createSales,
  deleteSales,
  idInput,
  listInput,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  readSales,
  searchAny,
  searchTerm,
  updateSales,
} from "./shared"

export const contactFields = z
  .object({
    type: z.enum(["individual", "company"]),
    firstName: optionalText(100),
    lastName: optionalText(100),
    companyName: optionalText(200),
    email: z
      .union([z.email("Enter a valid email"), z.literal("")])
      .nullish()
      .transform((v) => v || null),
    phone: optionalText(30),
    lineId: optionalText(50),
    taxId: z
      .union([z.string().regex(/^\d{13}$/, "Tax ID must be 13 digits"), z.literal("")])
      .nullish()
      .transform((v) => v || null),
    addressLine: optionalText(200),
    subdistrict: optionalText(100),
    district: optionalText(100),
    province: optionalText(100),
    postalCode: optionalText(10),
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.type === "company" && !v.companyName) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Company name is required" })
    }
    if (v.type === "individual" && !v.firstName) {
      ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" })
    }
  })

export type ContactFields = z.infer<typeof contactFields>

export const contactsRouter = router({
  list: readSales
    .input(listInput.extend({ type: z.enum(["individual", "company"]).optional() }))
    .query(async ({ ctx, input }) => {
      const term = searchTerm(input.search)
      const where = and(
        eq(contact.organizationId, ctx.orgId),
        input.type ? eq(contact.type, input.type) : undefined,
        searchAny(term, contactName, contact.phone, contact.email, contact.lineId),
      )
      const { limit, offset } = paginate(input.page)

      const [rows, [totals]] = await Promise.all([
        ctx.db
          .select({
            id: contact.id,
            type: contact.type,
            name: contactName,
            firstName: contact.firstName,
            lastName: contact.lastName,
            companyName: contact.companyName,
            phone: contact.phone,
            email: contact.email,
            lineId: contact.lineId,
            taxId: contact.taxId,
            addressLine: contact.addressLine,
            subdistrict: contact.subdistrict,
            district: contact.district,
            province: contact.province,
            postalCode: contact.postalCode,
            notes: contact.notes,
            createdAt: contact.createdAt,
          })
          .from(contact)
          .where(where)
          .orderBy(contactName)
          .limit(limit)
          .offset(offset),
        ctx.db.select({ total: count() }).from(contact).where(where),
      ])

      // Lead and contract counts for just this page of contacts
      const ids = rows.map((r) => r.id)
      const [leadCounts, contractCounts] = ids.length
        ? await Promise.all([
            ctx.db
              .select({ contactId: lead.contactId, count: count() })
              .from(lead)
              .where(inArray(lead.contactId, ids))
              .groupBy(lead.contactId),
            ctx.db
              .select({ contactId: salesContract.buyerId, count: count() })
              .from(salesContract)
              .where(and(inArray(salesContract.buyerId, ids), sql`${salesContract.status} <> 'cancelled'`))
              .groupBy(salesContract.buyerId),
          ])
        : [[], []]
      const leadsBy = new Map(leadCounts.map((c) => [c.contactId, c.count]))
      const contractsBy = new Map(contractCounts.map((c) => [c.contactId, c.count]))

      return {
        rows: rows.map((r) => ({ ...r, leads: leadsBy.get(r.id) ?? 0, contracts: contractsBy.get(r.id) ?? 0 })),
        total: totals?.total ?? 0,
        pageSize: PAGE_SIZE,
      }
    }),

  create: createSales.input(contactFields).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(contact)
      .values({ ...input, organizationId: ctx.orgId })
      .returning({ id: contact.id })
    return created
  }),

  update: updateSales.input(z.intersection(idInput, contactFields)).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [updated] = await ctx.db
      .update(contact)
      .set(fields)
      .where(and(eq(contact.id, id), eq(contact.organizationId, ctx.orgId)))
      .returning({ id: contact.id })
    if (!updated) throw notFound("Contact")
    return updated
  }),

  delete: deleteSales.input(idInput).mutation(async ({ ctx, input }) => {
    const where = and(eq(contact.id, input.id), eq(contact.organizationId, ctx.orgId))
    const [existing] = await ctx.db.select({ id: contact.id }).from(contact).where(where)
    if (!existing) throw notFound("Contact")

    // Reservations, contracts and payments are legal/financial history, so keep the contact they point to
    const [[reservations], [contracts], [payments]] = await Promise.all([
      ctx.db.select({ n: count() }).from(reservation).where(eq(reservation.contactId, input.id)),
      ctx.db.select({ n: count() }).from(salesContract).where(eq(salesContract.buyerId, input.id)),
      ctx.db.select({ n: count() }).from(customerPayment).where(eq(customerPayment.payerId, input.id)),
    ])
    if ((reservations?.n ?? 0) + (contracts?.n ?? 0) + (payments?.n ?? 0) > 0) {
      throw conflict("This contact has reservations, contracts or payments, so it can't be deleted.")
    }

    await ctx.db.delete(contact).where(where)
    return { id: input.id }
  }),
})
