import {
  contact,
  contractStatus,
  customerPayment,
  installment,
  lead,
  leadSource,
  leadStatus,
  paymentMethod,
  project,
  reservation,
  reservationStatus,
  salesContract,
  unit,
  unitType,
  user,
} from "@real-estate-management/db/schema/index"
import { and, count, desc, eq, gte, ilike, inArray, lt, or, type SQL, sql, sum } from "drizzle-orm"
import { z } from "zod"

import { areaProcedure, router } from "../index"

const PAGE_SIZE = 20

// Sales data is for the Sales & Marketing team; payments belong to Accounting & Finance
const readSales = areaProcedure("sales")
const readPayments = areaProcedure("accounting")

const listInput = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
})

const contactName = sql<string>`coalesce(${contact.companyName}, concat_ws(' ', ${contact.firstName}, ${contact.lastName}))`

/** `%term%` for ilike, or undefined when there's nothing to search for. */
const searchTerm = (search?: string) => (search ? `%${search}%` : undefined)

const searchAny = (term: string | undefined, ...columns: (SQL | Parameters<typeof ilike>[0])[]) =>
  term ? or(...columns.map((column) => ilike(column, term))) : undefined

const paginate = (page: number) => ({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })

export const salesRouter = router({
  leads: readSales
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

  contacts: readSales
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
            phone: contact.phone,
            email: contact.email,
            lineId: contact.lineId,
            province: contact.province,
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

  reservations: readSales
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
            unitNumber: unit.unitNumber,
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

  contracts: readSales
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
            netPrice: salesContract.netPrice,
            discountAmount: salesContract.discountAmount,
            scheduledTransferDate: salesContract.scheduledTransferDate,
            transferredOn: salesContract.transferredOn,
            unitNumber: unit.unitNumber,
            projectName: project.name,
            buyerName: contactName,
          })
          .from(salesContract)
          .innerJoin(unit, eq(unit.id, salesContract.unitId))
          .innerJoin(project, eq(project.id, unit.projectId))
          .innerJoin(contact, eq(contact.id, salesContract.buyerId))
          .where(where)
          .orderBy(desc(salesContract.contractDate))
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

      // Paid-to-date and overdue installments for this page of contracts
      const ids = rows.map((r) => r.id)
      const [paid, overdue] = ids.length
        ? await Promise.all([
            ctx.db
              .select({ contractId: customerPayment.contractId, amount: sum(customerPayment.amount) })
              .from(customerPayment)
              .where(inArray(customerPayment.contractId, ids))
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

  payments: readPayments
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
      const orgPayments = eq(customerPayment.organizationId, ctx.orgId)

      const [rows, [totals], [received]] = await Promise.all([
        ctx.db
          .select({
            id: customerPayment.id,
            receiptNumber: customerPayment.receiptNumber,
            amount: customerPayment.amount,
            method: customerPayment.method,
            paidAt: customerPayment.paidAt,
            bankReference: customerPayment.bankReference,
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
          .orderBy(desc(customerPayment.paidAt))
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
      ])

      const [upcoming] = await ctx.db
        .select({ amount: sum(installment.amount), count: count() })
        .from(installment)
        .where(
          and(
            eq(installment.organizationId, ctx.orgId),
            inArray(installment.status, ["pending", "partially_paid"]),
            gte(installment.dueDate, sql`current_date`),
            lt(installment.dueDate, sql`current_date + interval '30 days'`),
          ),
        )

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
})
