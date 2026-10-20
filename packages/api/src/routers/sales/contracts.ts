import {
  contact,
  contractStatus,
  customerPayment,
  installment,
  lead,
  project,
  reservation,
  salesContract,
  unit,
} from "@real-estate-management/db/schema/index"
import { and, asc, count, desc, eq, inArray, isNull, lt, notInArray, sql, sum } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { buildInstallmentSchedule } from "../../lib/installments"
import {
  badRequest,
  conflict,
  contactName,
  dateInput,
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
  salesOrAccounting,
  reasonInput,
  runBatch,
  searchAny,
  searchTerm,
  toMoney,
  updateSales,
  withNumberRetry,
} from "./shared"

const scheduleFields = z.object({
  contractDate: dateInput,
  discountAmount: moneyInput,
  downPaymentAmount: moneyInput,
  contractPaymentAmount: moneyInput,
  downPaymentMonths: z.number().int().min(0).max(60),
  scheduledTransferDate: dateInput,
  notes: optionalText(1000),
})

/** Validates the numbers and builds the installment schedule, or throws a readable BAD_REQUEST. */
function planContract(fields: z.infer<typeof scheduleFields>, listPrice: number, reservationFee: number) {
  if (fields.discountAmount >= listPrice) throw badRequest("Discount must be less than the list price.")
  const netPrice = listPrice - fields.discountAmount
  const schedule = buildInstallmentSchedule({
    netPrice,
    reservationFee,
    downPaymentAmount: fields.downPaymentAmount,
    contractPaymentAmount: fields.contractPaymentAmount,
    downPaymentMonths: fields.downPaymentMonths,
    contractDate: fields.contractDate,
    transferDate: fields.scheduledTransferDate,
  })
  if (schedule.error) throw badRequest(schedule.error)
  return { netPrice, items: schedule.items }
}

/** Contract plus the reservation fee it was converted from. */
async function loadContract(db: Parameters<typeof runBatch>[0], orgId: string, id: string) {
  const [row] = await db
    .select({
      id: salesContract.id,
      status: salesContract.status,
      unitId: salesContract.unitId,
      reservationId: salesContract.reservationId,
      salePrice: salesContract.salePrice,
      reservationFee: reservation.reservationFee,
    })
    .from(salesContract)
    .leftJoin(reservation, eq(reservation.id, salesContract.reservationId))
    .where(and(eq(salesContract.id, id), eq(salesContract.organizationId, orgId)))
  if (!row) throw notFound("Contract")
  return row
}

export const contractsRouter = router({
  list: readSales
    .input(listInput.extend({ status: z.enum(contractStatus.enumValues).optional() }))
    .query(async ({ ctx, input }) => {
      const term = searchTerm(input.search)
      const where = and(
        eq(salesContract.organizationId, ctx.orgId),
        input.status ? eq(salesContract.status, input.status) : undefined,
        searchAny(term, salesContract.contractNumber, unit.unitNumber, contactName, project.name),
      )
      const { limit, offset } = paginate(input.page)

      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: salesContract.id,
            contractNumber: salesContract.contractNumber,
            status: salesContract.status,
            contractDate: salesContract.contractDate,
            salePrice: salesContract.salePrice,
            netPrice: salesContract.netPrice,
            discountAmount: salesContract.discountAmount,
            downPaymentAmount: salesContract.downPaymentAmount,
            scheduledTransferDate: salesContract.scheduledTransferDate,
            transferredOn: salesContract.transferredOn,
            cancelReason: salesContract.cancelReason,
            notes: salesContract.notes,
            reservationFee: reservation.reservationFee,
            unitNumber: unit.unitNumber,
            houseNumber: unit.houseNumber,
            projectName: project.name,
            buyerName: contactName,
          })
          .from(salesContract)
          .innerJoin(unit, eq(unit.id, salesContract.unitId))
          .innerJoin(project, eq(project.id, unit.projectId))
          .innerJoin(contact, eq(contact.id, salesContract.buyerId))
          .leftJoin(reservation, eq(reservation.id, salesContract.reservationId))
          .where(where)
          .orderBy(desc(salesContract.contractDate), desc(salesContract.contractNumber))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(salesContract)
          .innerJoin(unit, eq(unit.id, salesContract.unitId))
          .innerJoin(project, eq(project.id, unit.projectId))
          .innerJoin(contact, eq(contact.id, salesContract.buyerId))
          .where(where),
        ctx.db
          .select({ status: salesContract.status, count: count(), value: sum(salesContract.netPrice) })
          .from(salesContract)
          .where(eq(salesContract.organizationId, ctx.orgId))
          .groupBy(salesContract.status),
      ])

      // Paid-to-date (excluding voided payments) and overdue installments for this page of contracts
      const ids = rows.map((r) => r.id)
      const [paid, overdue] = ids.length
        ? await Promise.all([
            ctx.db
              .select({ contractId: customerPayment.contractId, amount: sum(customerPayment.amount) })
              .from(customerPayment)
              .where(and(inArray(customerPayment.contractId, ids), isNull(customerPayment.voidedAt)))
              .groupBy(customerPayment.contractId),
            ctx.db
              .select({ contractId: installment.contractId, count: count() })
              .from(installment)
              .where(
                and(
                  inArray(installment.contractId, ids),
                  inArray(installment.status, ["pending", "partially_paid"]),
                  lt(installment.dueDate, sql`current_date`),
                ),
              )
              .groupBy(installment.contractId),
          ])
        : [[], []]
      const paidBy = new Map(paid.map((p) => [p.contractId, p.amount ?? "0"]))
      const overdueBy = new Map(overdue.map((o) => [o.contractId, o.count]))

      return {
        rows: rows.map((r) => ({
          ...r,
          paidAmount: paidBy.get(r.id) ?? "0",
          overdueInstallments: overdueBy.get(r.id) ?? 0,
        })),
        total: totals?.total ?? 0,
        pageSize: PAGE_SIZE,
        statusCounts,
      }
    }),

  /** Installment schedule with the amount paid on each (voided payments excluded). */
  installments: salesOrAccounting.input(z.object({ contractId: z.string().min(1) })).query(async ({ ctx, input }) => {
    const paid = ctx.db
      .select({ installmentId: customerPayment.installmentId, amount: sum(customerPayment.amount).as("paid") })
      .from(customerPayment)
      .where(and(eq(customerPayment.contractId, input.contractId), isNull(customerPayment.voidedAt)))
      .groupBy(customerPayment.installmentId)
      .as("paid")

    return ctx.db
      .select({
        id: installment.id,
        sequence: installment.sequence,
        type: installment.type,
        dueDate: installment.dueDate,
        amount: installment.amount,
        status: installment.status,
        paidAmount: sql<string>`coalesce(${paid.amount}, 0)`,
      })
      .from(installment)
      .leftJoin(paid, eq(paid.installmentId, installment.id))
      .where(and(eq(installment.contractId, input.contractId), eq(installment.organizationId, ctx.orgId)))
      .orderBy(asc(installment.sequence))
  }),

  /** Converts an active reservation into a contract with its installment schedule. */
  createFromReservation: updateSales
    .input(scheduleFields.extend({ reservationId: z.string().min(1), activate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [res] = await ctx.db
        .select({
          status: reservation.status,
          unitId: reservation.unitId,
          contactId: reservation.contactId,
          leadId: reservation.leadId,
          reservationFee: reservation.reservationFee,
          listPrice: unit.listPrice,
          unitNumber: unit.unitNumber,
        })
        .from(reservation)
        .innerJoin(unit, eq(unit.id, reservation.unitId))
        .where(and(eq(reservation.id, input.reservationId), eq(reservation.organizationId, ctx.orgId)))
      if (!res) throw notFound("Reservation")
      if (res.status !== "active")
        throw badRequest(`Only active reservations can be converted (this one is ${res.status}).`)

      const listPrice = Number(res.listPrice)
      const { netPrice, items } = planContract(input, listPrice, Number(res.reservationFee))
      const contractId = crypto.randomUUID()

      return withNumberRetry(
        async () => {
          const contractNumber = await nextDocumentNumber(ctx.db, {
            table: salesContract,
            column: salesContract.contractNumber,
            orgColumn: salesContract.organizationId,
            orgId: ctx.orgId,
            prefix: "SC",
          })

          await runBatch(ctx.db, [
            ctx.db.insert(salesContract).values({
              id: contractId,
              organizationId: ctx.orgId,
              contractNumber,
              unitId: res.unitId,
              buyerId: res.contactId,
              reservationId: input.reservationId,
              contractDate: input.contractDate,
              salePrice: toMoney(listPrice),
              discountAmount: toMoney(input.discountAmount),
              netPrice: toMoney(netPrice),
              downPaymentAmount: toMoney(input.downPaymentAmount),
              status: input.activate ? "active" : "draft",
              scheduledTransferDate: input.scheduledTransferDate,
              createdById: ctx.session.user.id,
              notes: input.notes,
            }),
            ctx.db
              .insert(installment)
              .values(items.map((item) => ({ ...item, organizationId: ctx.orgId, contractId }))),
            ctx.db.update(reservation).set({ status: "converted" }).where(eq(reservation.id, input.reservationId)),
            ctx.db.update(unit).set({ status: "contracted" }).where(eq(unit.id, res.unitId)),
            ...(res.leadId
              ? [ctx.db.update(lead).set({ status: "won", lostReason: null }).where(eq(lead.id, res.leadId))]
              : []),
          ])
          return { id: contractId, contractNumber }
        },
        () => conflict(`Unit ${res.unitNumber} already has an open contract.`),
      )
    }),

  /** Draft: everything can change and the schedule is rebuilt. Active: only the transfer date and notes. */
  update: updateSales.input(scheduleFields.extend(idInput.shape)).mutation(async ({ ctx, input }) => {
    const existing = await loadContract(ctx.db, ctx.orgId, input.id)
    const where = eq(salesContract.id, input.id)

    if (existing.status === "active") {
      await runBatch(ctx.db, [
        ctx.db
          .update(salesContract)
          .set({ scheduledTransferDate: input.scheduledTransferDate, notes: input.notes })
          .where(where),
        ctx.db
          .update(installment)
          .set({ dueDate: input.scheduledTransferDate })
          .where(and(eq(installment.contractId, input.id), eq(installment.type, "transfer_payment"))),
      ])
      return { id: input.id }
    }
    if (existing.status !== "draft") throw badRequest(`A ${existing.status} contract can't be edited.`)

    const listPrice = Number(existing.salePrice)
    const { netPrice, items } = planContract(input, listPrice, Number(existing.reservationFee ?? 0))
    await runBatch(ctx.db, [
      ctx.db.delete(installment).where(eq(installment.contractId, input.id)),
      ctx.db
        .insert(installment)
        .values(items.map((item) => ({ ...item, organizationId: ctx.orgId, contractId: input.id }))),
      ctx.db
        .update(salesContract)
        .set({
          contractDate: input.contractDate,
          discountAmount: toMoney(input.discountAmount),
          netPrice: toMoney(netPrice),
          downPaymentAmount: toMoney(input.downPaymentAmount),
          scheduledTransferDate: input.scheduledTransferDate,
          notes: input.notes,
        })
        .where(where),
    ])
    return { id: input.id }
  }),

  activate: updateSales.input(idInput).mutation(async ({ ctx, input }) => {
    const existing = await loadContract(ctx.db, ctx.orgId, input.id)
    if (existing.status !== "draft") throw badRequest("Only draft contracts can be activated.")
    await ctx.db.update(salesContract).set({ status: "active" }).where(eq(salesContract.id, input.id))
    return { id: input.id }
  }),

  /** Ownership transfer at the Land Office. Every installment must be paid or waived first. */
  markTransferred: updateSales.input(idInput.extend({ transferredOn: dateInput })).mutation(async ({ ctx, input }) => {
    const existing = await loadContract(ctx.db, ctx.orgId, input.id)
    if (existing.status !== "active") throw badRequest("Only active contracts can be transferred.")

    const [unpaid] = await ctx.db
      .select({ n: count() })
      .from(installment)
      .where(and(eq(installment.contractId, input.id), notInArray(installment.status, ["paid", "waived"])))
    if ((unpaid?.n ?? 0) > 0) {
      throw badRequest(`${unpaid?.n} installment(s) are still unpaid. Record the payments before transferring.`)
    }

    await runBatch(ctx.db, [
      ctx.db
        .update(salesContract)
        .set({ status: "transferred", transferredOn: input.transferredOn })
        .where(eq(salesContract.id, input.id)),
      ctx.db.update(unit).set({ status: "transferred" }).where(eq(unit.id, existing.unitId)),
    ])
    return { id: input.id }
  }),

  /** Releases the unit and waives unpaid installments. Payments already received stay on record. */
  cancel: deleteSales.input(reasonInput).mutation(async ({ ctx, input }) => {
    const existing = await loadContract(ctx.db, ctx.orgId, input.id)
    if (existing.status !== "draft" && existing.status !== "active") {
      throw badRequest(`A ${existing.status} contract can't be cancelled.`)
    }

    await runBatch(ctx.db, [
      ctx.db
        .update(salesContract)
        .set({ status: "cancelled", cancelReason: input.reason })
        .where(eq(salesContract.id, input.id)),
      ctx.db
        .update(installment)
        .set({ status: "waived" })
        .where(and(eq(installment.contractId, input.id), inArray(installment.status, ["pending", "partially_paid"]))),
      ctx.db.update(unit).set({ status: "available" }).where(eq(unit.id, existing.unitId)),
    ])
    return { id: input.id }
  }),

  /** Only drafts can be deleted. The reservation goes back to active and the unit back to reserved. */
  delete: deleteSales.input(idInput).mutation(async ({ ctx, input }) => {
    const existing = await loadContract(ctx.db, ctx.orgId, input.id)
    if (existing.status !== "draft") throw badRequest("Only draft contracts can be deleted. Cancel it instead.")

    const [payments] = await ctx.db
      .select({ n: count() })
      .from(customerPayment)
      .where(eq(customerPayment.contractId, input.id))
    if ((payments?.n ?? 0) > 0) throw conflict("This contract has payments, so it can't be deleted. Cancel it instead.")

    await runBatch(ctx.db, [
      ctx.db.delete(salesContract).where(eq(salesContract.id, input.id)),
      ...(existing.reservationId
        ? [ctx.db.update(reservation).set({ status: "active" }).where(eq(reservation.id, existing.reservationId))]
        : []),
      ctx.db
        .update(unit)
        .set({ status: existing.reservationId ? "reserved" : "available" })
        .where(eq(unit.id, existing.unitId)),
    ])
    return { id: input.id }
  }),
})
