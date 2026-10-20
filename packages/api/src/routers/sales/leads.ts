import {
  contact,
  lead,
  leadSource,
  leadStatus,
  project,
  reservation,
  unitType,
  user,
} from "@real-estate-management/db/schema/index"
import { and, count, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { contactFields } from "./contacts"
import {
  assertMember,
  badRequest,
  conflict,
  contactName,
  createSales,
  deleteSales,
  idInput,
  listInput,
  moneyInput,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  readSales,
  runBatch,
  searchAny,
  searchTerm,
  toMoney,
  updateSales,
} from "./shared"
import type { Database } from "@real-estate-management/db"

const leadFields = z.object({
  projectId: z.string().nullish(),
  interestedUnitTypeId: z.string().nullish(),
  assignedToId: z.string().nullish(),
  source: z.enum(leadSource.enumValues),
  status: z.enum(leadStatus.enumValues),
  budgetMin: moneyInput.nullish(),
  budgetMax: moneyInput.nullish(),
  lostReason: optionalText(500),
})

type LeadFields = z.infer<typeof leadFields>

function checkLeadFields(v: LeadFields) {
  if (v.status === "lost" && !v.lostReason) throw badRequest("Give a reason when marking a lead as lost.")
  if (v.budgetMin != null && v.budgetMax != null && v.budgetMin > v.budgetMax) {
    throw badRequest("Minimum budget can't be more than the maximum.")
  }
}

/** Project, unit type (must belong to the project) and assignee all belong to the org. */
async function assertLeadRefs(db: Database, orgId: string, v: LeadFields) {
  if (v.projectId) {
    const [row] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, v.projectId), eq(project.organizationId, orgId)))
    if (!row) throw notFound("Project")
  }
  if (v.interestedUnitTypeId) {
    if (!v.projectId) throw badRequest("Pick a project before picking a unit type.")
    const [row] = await db
      .select({ id: unitType.id })
      .from(unitType)
      .where(and(eq(unitType.id, v.interestedUnitTypeId), eq(unitType.projectId, v.projectId)))
    if (!row) throw notFound("Unit type in this project")
  }
  await assertMember(db, orgId, v.assignedToId)
}

const toLeadValues = (v: LeadFields) => ({
  projectId: v.projectId || null,
  interestedUnitTypeId: v.interestedUnitTypeId || null,
  assignedToId: v.assignedToId || null,
  source: v.source,
  status: v.status,
  budgetMin: v.budgetMin == null ? null : toMoney(v.budgetMin),
  budgetMax: v.budgetMax == null ? null : toMoney(v.budgetMax),
  lostReason: v.status === "lost" ? v.lostReason : null,
})

export const leadsRouter = router({
  list: readSales
    .input(
      listInput.extend({
        status: z.enum(leadStatus.enumValues).optional(),
        source: z.enum(leadSource.enumValues).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const term = searchTerm(input.search)
      const where = and(
        eq(lead.organizationId, ctx.orgId),
        input.status ? eq(lead.status, input.status) : undefined,
        input.source ? eq(lead.source, input.source) : undefined,
        searchAny(term, contactName, contact.phone, contact.email, project.name),
      )
      const { limit, offset } = paginate(input.page)

      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: lead.id,
            status: lead.status,
            source: lead.source,
            budgetMin: lead.budgetMin,
            budgetMax: lead.budgetMax,
            lostReason: lead.lostReason,
            createdAt: lead.createdAt,
            contactId: lead.contactId,
            projectId: lead.projectId,
            interestedUnitTypeId: lead.interestedUnitTypeId,
            assignedToId: lead.assignedToId,
            contactName,
            phone: contact.phone,
            email: contact.email,
            projectName: project.name,
            unitTypeName: unitType.name,
            assignedTo: user.name,
          })
          .from(lead)
          .innerJoin(contact, eq(contact.id, lead.contactId))
          .leftJoin(project, eq(project.id, lead.projectId))
          .leftJoin(unitType, eq(unitType.id, lead.interestedUnitTypeId))
          .leftJoin(user, eq(user.id, lead.assignedToId))
          .where(where)
          .orderBy(desc(lead.updatedAt), desc(lead.id))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(lead)
          .innerJoin(contact, eq(contact.id, lead.contactId))
          .leftJoin(project, eq(project.id, lead.projectId))
          .where(where),
        ctx.db
          .select({ status: lead.status, count: count() })
          .from(lead)
          .where(eq(lead.organizationId, ctx.orgId))
          .groupBy(lead.status),
      ])

      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE, statusCounts }
    }),

  /** Creates a lead for an existing contact, or for a new contact entered in the same form. */
  create: createSales
    .input(
      leadFields.extend({
        contactId: z.string().nullish(),
        newContact: contactFields.nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      checkLeadFields(input)
      if (!input.contactId === !input.newContact) throw badRequest("Pick an existing contact or enter a new one.")
      await assertLeadRefs(ctx.db, ctx.orgId, input)

      let contactId = input.contactId
      if (contactId) {
        const [row] = await ctx.db
          .select({ id: contact.id })
          .from(contact)
          .where(and(eq(contact.id, contactId), eq(contact.organizationId, ctx.orgId)))
        if (!row) throw notFound("Contact")
      }

      const leadId = crypto.randomUUID()
      const newContactId = crypto.randomUUID()
      contactId ??= newContactId

      await runBatch(ctx.db, [
        ...(input.newContact
          ? [ctx.db.insert(contact).values({ ...input.newContact, id: newContactId, organizationId: ctx.orgId })]
          : []),
        ctx.db.insert(lead).values({ id: leadId, organizationId: ctx.orgId, contactId, ...toLeadValues(input) }),
      ])
      return { id: leadId, contactId }
    }),

  update: updateSales.input(leadFields.extend(idInput.shape)).mutation(async ({ ctx, input }) => {
    checkLeadFields(input)
    await assertLeadRefs(ctx.db, ctx.orgId, input)
    const [updated] = await ctx.db
      .update(lead)
      .set(toLeadValues(input))
      .where(and(eq(lead.id, input.id), eq(lead.organizationId, ctx.orgId)))
      .returning({ id: lead.id })
    if (!updated) throw notFound("Lead")
    return updated
  }),

  delete: deleteSales.input(idInput).mutation(async ({ ctx, input }) => {
    const where = and(eq(lead.id, input.id), eq(lead.organizationId, ctx.orgId))
    const [existing] = await ctx.db.select({ id: lead.id }).from(lead).where(where)
    if (!existing) throw notFound("Lead")

    const [reservations] = await ctx.db.select({ n: count() }).from(reservation).where(eq(reservation.leadId, input.id))
    if ((reservations?.n ?? 0) > 0) throw conflict("This lead has reservations, so it can't be deleted.")

    await ctx.db.delete(lead).where(where)
    return { id: input.id }
  }),
})
