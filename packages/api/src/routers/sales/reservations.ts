import {
  contact,
  customerPayment,
  lead,
  paymentMethod,
  project,
  reservation,
  reservationStatus,
  unit,
  user,
} from "@real-estate-management/db/schema/index"
import { and, count, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import {
  assertMember,
  badRequest,
  conflict,
  contactName,
  createSales,
  dateInput,
  dateToTimestamp,
  deleteSales,
  idInput,
  listInput,
  moneyInput,
  nextDocumentNumber,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  readSales,
  reasonInput,
  runBatch,
  searchAny,
  searchTerm,
  toMoney,
  updateSales,
  withNumberRetry,
} from "./shared"

/** End of the expiry day, Bangkok time. */
const expiryToTimestamp = (date: string) => new Date(`${date}T23:59:59+07:00`)

export const reservationsRouter = router({
  list: readSales
    .input(listInput.extend({ status: z.enum(reservationStatus.enumValues).optional() }))
    .query(async ({ ctx, input }) => {
      const term = searchTerm(input.search)
      const where = and(
        eq(reservation.organizationId, ctx.orgId),
        input.status ? eq(reservation.status, input.status) : undefined,
        searchAny(term, reservation.reservationNumber, unit.unitNumber, contactName, project.name),
      )
      const { limit, offset } = paginate(input.page)

      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: reservation.id,
            reservationNumber: reservation.reservationNumber,
            status: reservation.status,
            reservationFee: reservation.reservationFee,
            reservedAt: reservation.reservedAt,
            expiresAt: reservation.expiresAt,
            cancelReason: reservation.cancelReason,
            notes: reservation.notes,
            salespersonId: reservation.salespersonId,
            unitNumber: unit.unitNumber,
            listPrice: unit.listPrice,
            projectName: project.name,
            contactName,
            phone: contact.phone,
            salesperson: user.name,
          })
          .from(reservation)
          .innerJoin(unit, eq(unit.id, reservation.unitId))
          .innerJoin(project, eq(project.id, unit.projectId))
          .innerJoin(contact, eq(contact.id, reservation.contactId))
          .leftJoin(user, eq(user.id, reservation.salespersonId))
          .where(where)
          .orderBy(desc(reservation.reservedAt))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(reservation)
          .innerJoin(unit, eq(unit.id, reservation.unitId))
          .innerJoin(project, eq(project.id, unit.projectId))
          .innerJoin(contact, eq(contact.id, reservation.contactId))
          .where(where),
        ctx.db
          .select({ status: reservation.status, count: count() })
          .from(reservation)
          .where(eq(reservation.organizationId, ctx.orgId))
          .groupBy(reservation.status),
      ])

      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE, statusCounts }
    }),

  /** Reserves an available unit: creates the reservation and its fee receipt, and marks the unit reserved. */
  create: createSales
    .input(
      z.object({
        unitId: z.string().min(1),
        contactId: z.string().min(1),
        leadId: z.string().nullish(),
        salespersonId: z.string().nullish(),
        reservationFee: moneyInput.positive("Reservation fee must be more than zero"),
        expiresAt: dateInput,
        notes: optionalText(1000),
        payment: z.object({
          method: z.enum(paymentMethod.enumValues),
          paidAt: dateInput,
          bankReference: optionalText(100),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [[unitRow], [contactRow], [leadRow]] = await Promise.all([
        ctx.db
          .select({ status: unit.status, unitNumber: unit.unitNumber })
          .from(unit)
          .where(and(eq(unit.id, input.unitId), eq(unit.organizationId, ctx.orgId))),
        ctx.db
          .select({ id: contact.id })
          .from(contact)
          .where(and(eq(contact.id, input.contactId), eq(contact.organizationId, ctx.orgId))),
        input.leadId
          ? ctx.db
              .select({ contactId: lead.contactId, status: lead.status })
              .from(lead)
              .where(and(eq(lead.id, input.leadId), eq(lead.organizationId, ctx.orgId)))
          : Promise.resolve([]),
      ])
      if (!unitRow) throw notFound("Unit")
      if (unitRow.status !== "available")
        throw conflict(`Unit ${unitRow.unitNumber} is ${unitRow.status.replace("_", " ")}.`)
      if (!contactRow) throw notFound("Contact")
      if (input.leadId && !leadRow) throw notFound("Lead")
      if (leadRow && leadRow.contactId !== input.contactId)
        throw badRequest("That lead belongs to a different contact.")
      if (input.expiresAt < input.payment.paidAt) throw badRequest("Expiry date must be after the reservation date.")
      await assertMember(ctx.db, ctx.orgId, input.salespersonId)

      const reservedAt = dateToTimestamp(input.payment.paidAt)
      const reservationId = crypto.randomUUID()

      return withNumberRetry(
        async () => {
          const [reservationNumber, receiptNumber] = await Promise.all([
            nextDocumentNumber(ctx.db, {
              table: reservation,
              column: reservation.reservationNumber,
              orgColumn: reservation.organizationId,
              orgId: ctx.orgId,
              prefix: "RS",
            }),
            nextDocumentNumber(ctx.db, {
              table: customerPayment,
              column: customerPayment.receiptNumber,
              orgColumn: customerPayment.organizationId,
              orgId: ctx.orgId,
              prefix: "RC",
              width: 5,
            }),
          ])

          await runBatch(ctx.db, [
            ctx.db.insert(reservation).values({
              id: reservationId,
              organizationId: ctx.orgId,
              reservationNumber,
              unitId: input.unitId,
              contactId: input.contactId,
              leadId: input.leadId || null,
              salespersonId: input.salespersonId || ctx.session.user.id,
              reservationFee: toMoney(input.reservationFee),
              reservedAt,
              expiresAt: expiryToTimestamp(input.expiresAt),
              notes: input.notes,
            }),
            ctx.db.insert(customerPayment).values({
              organizationId: ctx.orgId,
              receiptNumber,
              payerId: input.contactId,
              reservationId,
              amount: toMoney(input.reservationFee),
              method: input.payment.method,
              paidAt: reservedAt,
              bankReference: input.payment.bankReference,
              recordedById: ctx.session.user.id,
            }),
            ctx.db
              .update(unit)
              .set({ status: "reserved" })
              .where(and(eq(unit.id, input.unitId), eq(unit.status, "available"))),
            ...(input.leadId && leadRow?.status !== "won"
              ? [ctx.db.update(lead).set({ status: "negotiating", lostReason: null }).where(eq(lead.id, input.leadId))]
              : []),
          ])
          return { id: reservationId, reservationNumber }
        },
        () => conflict(`Unit ${unitRow.unitNumber} already has an active reservation.`),
      )
    }),

  update: updateSales
    .input(
      idInput.extend({
        expiresAt: dateInput,
        salespersonId: z.string().nullish(),
        notes: optionalText(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const where = and(eq(reservation.id, input.id), eq(reservation.organizationId, ctx.orgId))
      const [existing] = await ctx.db.select({ status: reservation.status }).from(reservation).where(where)
      if (!existing) throw notFound("Reservation")
      if (existing.status !== "active")
        throw badRequest(`Only active reservations can be edited (this one is ${existing.status}).`)
      await assertMember(ctx.db, ctx.orgId, input.salespersonId)

      await ctx.db
        .update(reservation)
        .set({
          expiresAt: expiryToTimestamp(input.expiresAt),
          salespersonId: input.salespersonId || null,
          notes: input.notes,
        })
        .where(where)
      return { id: input.id }
    }),

  /** Releases the unit. The fee payment stays on record. */
  cancel: deleteSales.input(reasonInput).mutation(async ({ ctx, input }) => {
    const where = and(eq(reservation.id, input.id), eq(reservation.organizationId, ctx.orgId))
    const [existing] = await ctx.db
      .select({ status: reservation.status, unitId: reservation.unitId, leadId: reservation.leadId })
      .from(reservation)
      .where(where)
    if (!existing) throw notFound("Reservation")
    if (existing.status !== "active")
      throw badRequest(`Only active reservations can be cancelled (this one is ${existing.status}).`)

    await runBatch(ctx.db, [
      ctx.db.update(reservation).set({ status: "cancelled", cancelReason: input.reason }).where(where),
      ctx.db
        .update(unit)
        .set({ status: "available" })
        .where(and(eq(unit.id, existing.unitId), eq(unit.status, "reserved"))),
      ...(existing.leadId
        ? [
            ctx.db
              .update(lead)
              .set({ status: "lost", lostReason: `Reservation cancelled: ${input.reason}` })
              .where(eq(lead.id, existing.leadId)),
          ]
        : []),
    ])
    return { id: input.id }
  }),
})
