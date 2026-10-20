import type { Database } from "@real-estate-management/db"
import {
  contact,
  customerPayment,
  installment,
  paymentMethod,
  reservation,
  salesContract,
  user,
} from "@real-estate-management/db/schema/index"
import { and, count, desc, eq, gte, inArray, isNull, lt, ne, sql, sum } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import { z } from "zod"

import { router } from "../../index"
import {
  badRequest,
  contactName,
  dateInput,
  dateToTimestamp,
  listInput,
  moneyInput,
  nextDocumentNumber,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  readPayments,
  recordPayments,
  voidPayments,
  reasonInput,
  runBatch,
  searchAny,
  searchTerm,
  toMoney,
  withNumberRetry,
} from "./shared"

const notVoided = isNull(customerPayment.voidedAt)

/** Satang, so comparisons don't suffer from float rounding. */
const satang = (value: string | number | null | undefined) => Math.round(Number(value ?? 0) * 100)

function installmentStatus(paidSatang: number, amountSatang: number) {
  if (paidSatang >= amountSatang) return "paid" as const
  return paidSatang > 0 ? ("partially_paid" as const) : ("pending" as const)
}

/** Sum of non-voided payments on an installment, optionally leaving one payment out. */
async function paidOnInstallment(db: Database, installmentId: string, excludePaymentId?: string) {
  const [row] = await db
    .select({ amount: sum(customerPayment.amount) })
    .from(customerPayment)
    .where(
      and(
        eq(customerPayment.installmentId, installmentId),
        notVoided,
        excludePaymentId ? ne(customerPayment.id, excludePaymentId) : undefined,
      ),
    )
  return satang(row?.amount)
}

export const paymentsRouter = router({
  list: readPayments
    .input(listInput.extend({ method: z.enum(paymentMethod.enumValues).optional() }))
    .query(async ({ ctx, input }) => {
      const term = searchTerm(input.search)
      const where = and(
        eq(customerPayment.organizationId, ctx.orgId),
        input.method ? eq(customerPayment.method, input.method) : undefined,
        searchAny(
          term,
          customerPayment.receiptNumber,
          customerPayment.bankReference,
          contactName,
          salesContract.contractNumber,
          reservation.reservationNumber,
        ),
      )
      const { limit, offset } = paginate(input.page)
      const orgPayments = and(eq(customerPayment.organizationId, ctx.orgId), notVoided)

      const [rows, [totals], [received], [upcoming]] = await Promise.all([
        ctx.db
          .select({
            id: customerPayment.id,
            receiptNumber: customerPayment.receiptNumber,
            amount: customerPayment.amount,
            method: customerPayment.method,
            paidAt: customerPayment.paidAt,
            bankReference: customerPayment.bankReference,
            voidedAt: customerPayment.voidedAt,
            voidReason: customerPayment.voidReason,
            payerName: contactName,
            contractNumber: salesContract.contractNumber,
            reservationNumber: reservation.reservationNumber,
            installmentSequence: installment.sequence,
            installmentType: installment.type,
            recordedBy: user.name,
          })
          .from(customerPayment)
          .innerJoin(contact, eq(contact.id, customerPayment.payerId))
          .leftJoin(salesContract, eq(salesContract.id, customerPayment.contractId))
          .leftJoin(reservation, eq(reservation.id, customerPayment.reservationId))
          .leftJoin(installment, eq(installment.id, customerPayment.installmentId))
          .leftJoin(user, eq(user.id, customerPayment.recordedById))
          .where(where)
          .orderBy(desc(customerPayment.paidAt), desc(customerPayment.receiptNumber))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(customerPayment)
          .innerJoin(contact, eq(contact.id, customerPayment.payerId))
          .leftJoin(salesContract, eq(salesContract.id, customerPayment.contractId))
          .leftJoin(reservation, eq(reservation.id, customerPayment.reservationId))
          .where(where),
        ctx.db
          .select({
            allTime: sum(customerPayment.amount),
            last30Days: sum(
              sql`case when ${customerPayment.paidAt} >= now() - interval '30 days' then ${customerPayment.amount} end`,
            ),
            count: count(),
          })
          .from(customerPayment)
          .where(orgPayments),
        ctx.db
          .select({ amount: sum(installment.amount), count: count() })
          .from(installment)
          .where(
            and(
              eq(installment.organizationId, ctx.orgId),
              inArray(installment.status, ["pending", "partially_paid"]),
              gte(installment.dueDate, sql`current_date`),
              lt(installment.dueDate, sql`current_date + interval '30 days'`),
            ),
          ),
      ])

      return {
        rows,
        total: totals?.total ?? 0,
        pageSize: PAGE_SIZE,
        summary: {
          receivedAllTime: received?.allTime ?? "0",
          receivedLast30Days: received?.last30Days ?? "0",
          paymentCount: received?.count ?? 0,
          dueNext30Days: upcoming?.amount ?? "0",
          dueNext30DaysCount: upcoming?.count ?? 0,
        },
      }
    }),

  /** Records money received against an active contract, and updates the installment's status. */
  record: recordPayments
    .input(
      z.object({
        contractId: z.string().min(1),
        installmentId: z.string().nullish(),
        amount: moneyInput.positive("Amount must be more than zero"),
        method: z.enum(paymentMethod.enumValues),
        paidAt: dateInput,
        bankReference: optionalText(100),
        notes: optionalText(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [contract] = await ctx.db
        .select({ status: salesContract.status, buyerId: salesContract.buyerId })
        .from(salesContract)
        .where(and(eq(salesContract.id, input.contractId), eq(salesContract.organizationId, ctx.orgId)))
      if (!contract) throw notFound("Contract")
      if (contract.status !== "active") throw badRequest("Payments can only be recorded on active contracts.")

      let nextStatus: ReturnType<typeof installmentStatus> | null = null
      if (input.installmentId) {
        const [inst] = await ctx.db
          .select({ amount: installment.amount, status: installment.status })
          .from(installment)
          .where(and(eq(installment.id, input.installmentId), eq(installment.contractId, input.contractId)))
        if (!inst) throw notFound("Installment on this contract")
        if (inst.status === "paid" || inst.status === "waived")
          throw badRequest(`That installment is already ${inst.status}.`)

        const paid = await paidOnInstallment(ctx.db, input.installmentId)
        const remaining = satang(inst.amount) - paid
        if (satang(input.amount) > remaining) {
          throw badRequest(`That's more than the ${toMoney(remaining / 100)} baht still due on this installment.`)
        }
        nextStatus = installmentStatus(paid + satang(input.amount), satang(inst.amount))
      }

      const paymentId = crypto.randomUUID()
      return withNumberRetry(
        async () => {
          const receiptNumber = await nextDocumentNumber(ctx.db, {
            table: customerPayment,
            column: customerPayment.receiptNumber,
            orgColumn: customerPayment.organizationId,
            orgId: ctx.orgId,
            prefix: "RC",
            width: 5,
          })
          await runBatch(ctx.db, [
            ctx.db.insert(customerPayment).values({
              id: paymentId,
              organizationId: ctx.orgId,
              receiptNumber,
              payerId: contract.buyerId,
              contractId: input.contractId,
              installmentId: input.installmentId || null,
              amount: toMoney(input.amount),
              method: input.method,
              paidAt: dateToTimestamp(input.paidAt),
              bankReference: input.bankReference,
              recordedById: ctx.session.user.id,
              notes: input.notes,
            }),
            ...(input.installmentId && nextStatus
              ? [ctx.db.update(installment).set({ status: nextStatus }).where(eq(installment.id, input.installmentId))]
              : []),
          ])
          return { id: paymentId, receiptNumber }
        },
        () => badRequest("Couldn't allocate a receipt number. Try again."),
      )
    }),

  /** Keeps the receipt for audit, stops it counting, and re-opens the installment if needed. */
  void: voidPayments.input(reasonInput).mutation(async ({ ctx, input }) => {
    const [payment] = await ctx.db
      .select({ voidedAt: customerPayment.voidedAt, installmentId: customerPayment.installmentId })
      .from(customerPayment)
      .where(and(eq(customerPayment.id, input.id), eq(customerPayment.organizationId, ctx.orgId)))
    if (!payment) throw notFound("Payment")
    if (payment.voidedAt) throw badRequest("This payment is already voided.")

    const updates: BatchItem<"pg">[] = [
      ctx.db
        .update(customerPayment)
        .set({ voidedAt: new Date(), voidReason: input.reason, voidedById: ctx.session.user.id })
        .where(eq(customerPayment.id, input.id)),
    ]

    if (payment.installmentId) {
      const [[inst], remainingPaid] = await Promise.all([
        ctx.db
          .select({ amount: installment.amount, status: installment.status })
          .from(installment)
          .where(eq(installment.id, payment.installmentId)),
        paidOnInstallment(ctx.db, payment.installmentId, input.id),
      ])
      // Waived installments (cancelled contracts) stay waived
      if (inst && inst.status !== "waived") {
        updates.push(
          ctx.db
            .update(installment)
            .set({ status: installmentStatus(remainingPaid, satang(inst.amount)) })
            .where(eq(installment.id, payment.installmentId)),
        )
      }
    }

    await runBatch(ctx.db, updates)
    return { id: input.id }
  }),
})
