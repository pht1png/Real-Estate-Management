import { user } from "@real-estate-management/db/schema/auth"
import {
  activityLog,
  goodsReceipt,
  goodsReceiptItem,
  project,
  purchaseOrder,
  purchaseOrderItem,
  supplier,
} from "@real-estate-management/db/schema/index"
import { and, asc, count, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import { router } from "../../index"
import {
  canReceiveGoods,
  canVoidReceipt,
  receivableStatuses,
  remainingByLine,
  statusAfterReceipts,
} from "../../lib/procurement-rules"
import { receivedByLine } from "./orders"
import {
  activity,
  actorOf,
  assertThat,
  badRequest,
  conflict,
  dateInput,
  idInput,
  listInput,
  nextDocumentNumber,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  procurementProcedure,
  reasonInput,
  runBatch,
  searchAny,
  searchTerm,
  withNumberRetry,
} from "./shared"

const quantityInput = z.number().min(0).max(1_000_000_000)

const receiver = alias(user, "receiver")
const voider = alias(user, "voider")

export const receiptsRouter = router({
  list: procurementProcedure
    .input(listInput.extend({ orderId: z.string().optional(), voided: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(goodsReceipt.organizationId, ctx.orgId),
        input.orderId ? eq(goodsReceipt.purchaseOrderId, input.orderId) : undefined,
        input.voided === undefined
          ? undefined
          : input.voided
            ? isNotNull(goodsReceipt.voidedAt)
            : isNull(goodsReceipt.voidedAt),
        searchAny(
          searchTerm(input.search),
          goodsReceipt.grNumber,
          goodsReceipt.deliveryNoteNumber,
          purchaseOrder.poNumber,
          supplier.name,
        ),
      )
      const { limit, offset } = paginate(input.page)
      const from = () =>
        ctx.db
          .select({ total: count() })
          .from(goodsReceipt)
          .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.purchaseOrderId))
          .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
          .where(where)
      const [rows, [totals]] = await Promise.all([
        ctx.db
          .select({
            id: goodsReceipt.id,
            grNumber: goodsReceipt.grNumber,
            receivedOn: goodsReceipt.receivedOn,
            deliveryNoteNumber: goodsReceipt.deliveryNoteNumber,
            notes: goodsReceipt.notes,
            voidedAt: goodsReceipt.voidedAt,
            voidReason: goodsReceipt.voidReason,
            orderId: purchaseOrder.id,
            poNumber: purchaseOrder.poNumber,
            orderStatus: purchaseOrder.status,
            supplierName: supplier.name,
            projectName: project.name,
            receiverName: receiver.name,
            voiderName: voider.name,
            lineCount: ctx.db.$count(goodsReceiptItem, eq(goodsReceiptItem.goodsReceiptId, goodsReceipt.id)),
          })
          .from(goodsReceipt)
          .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.purchaseOrderId))
          .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
          .innerJoin(project, eq(project.id, purchaseOrder.projectId))
          .leftJoin(receiver, eq(receiver.id, goodsReceipt.receivedById))
          .leftJoin(voider, eq(voider.id, goodsReceipt.voidedById))
          .where(where)
          .orderBy(desc(goodsReceipt.receivedOn), desc(goodsReceipt.grNumber))
          .limit(limit)
          .offset(offset),
        from(),
      ])
      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE }
    }),

  /** One receipt's lines, for the expandable row / detail sheet. */
  get: procurementProcedure.input(idInput).query(async ({ ctx, input }) => {
    const [receipt] = await ctx.db
      .select({ id: goodsReceipt.id, purchaseOrderId: goodsReceipt.purchaseOrderId })
      .from(goodsReceipt)
      .where(and(eq(goodsReceipt.id, input.id), eq(goodsReceipt.organizationId, ctx.orgId)))
    if (!receipt) throw notFound("Goods receipt")
    const lines = await ctx.db
      .select({
        id: goodsReceiptItem.id,
        description: purchaseOrderItem.description,
        unitOfMeasure: purchaseOrderItem.unitOfMeasure,
        ordered: purchaseOrderItem.quantity,
        received: goodsReceiptItem.quantityReceived,
        rejected: goodsReceiptItem.quantityRejected,
        notes: goodsReceiptItem.notes,
      })
      .from(goodsReceiptItem)
      .innerJoin(purchaseOrderItem, eq(purchaseOrderItem.id, goodsReceiptItem.purchaseOrderItemId))
      .where(eq(goodsReceiptItem.goodsReceiptId, input.id))
      .orderBy(asc(purchaseOrderItem.sortOrder))
    return { ...receipt, lines }
  }),

  /** Records a delivery against a PO. Partial deliveries are fine; more than what's still to come is not. */
  create: procurementProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        receivedOn: dateInput,
        deliveryNoteNumber: optionalText(100),
        notes: optionalText(2000),
        lines: z
          .array(
            z.object({
              orderItemId: z.string().min(1),
              received: quantityInput,
              rejected: quantityInput.default(0),
              notes: optionalText(500),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertThat(canReceiveGoods(actorOf(ctx)), "Only Construction or Procurement can record deliveries.")
      const [po] = await ctx.db
        .select({ status: purchaseOrder.status, poNumber: purchaseOrder.poNumber })
        .from(purchaseOrder)
        .where(and(eq(purchaseOrder.id, input.orderId), eq(purchaseOrder.organizationId, ctx.orgId)))
      if (!po) throw notFound("Purchase order")
      if (!(receivableStatuses as readonly string[]).includes(po.status)) {
        throw badRequest("Goods can only be received against approved or sent purchase orders.")
      }

      const [items, received] = await Promise.all([
        ctx.db
          .select({ id: purchaseOrderItem.id, quantity: purchaseOrderItem.quantity })
          .from(purchaseOrderItem)
          .where(eq(purchaseOrderItem.purchaseOrderId, input.orderId)),
        receivedByLine(ctx.db, input.orderId),
      ])
      const ordered = items.map((i) => ({ id: i.id, ordered: Number(i.quantity) }))
      const remaining = remainingByLine(ordered, received)

      const lines = input.lines.filter((l) => l.received > 0 || l.rejected > 0)
      if (!lines.length) throw badRequest("Enter what arrived on at least one line.")
      const after = new Map(received)
      for (const line of lines) {
        const left = remaining.get(line.orderItemId)
        if (left === undefined) throw badRequest("A line doesn't belong to this purchase order.")
        if (line.received > left + 1e-9) {
          throw badRequest(`That's more than the ${left} still to come on one of the lines.`)
        }
        after.set(line.orderItemId, (after.get(line.orderItemId) ?? 0) + line.received)
      }
      const nextStatus = statusAfterReceipts(ordered, after)

      const id = crypto.randomUUID()
      return withNumberRetry(
        async () => {
          const grNumber = await nextDocumentNumber(ctx.db, {
            table: goodsReceipt,
            column: goodsReceipt.grNumber,
            orgColumn: goodsReceipt.organizationId,
            orgId: ctx.orgId,
            prefix: "GR",
          })
          await runBatch(ctx.db, [
            ctx.db.insert(goodsReceipt).values({
              id,
              organizationId: ctx.orgId,
              grNumber,
              purchaseOrderId: input.orderId,
              receivedOn: input.receivedOn,
              receivedById: ctx.session.user.id,
              deliveryNoteNumber: input.deliveryNoteNumber,
              notes: input.notes,
            }),
            ctx.db.insert(goodsReceiptItem).values(
              lines.map((l) => ({
                organizationId: ctx.orgId,
                goodsReceiptId: id,
                purchaseOrderItemId: l.orderItemId,
                quantityReceived: l.received.toFixed(3),
                quantityRejected: l.rejected.toFixed(3),
                notes: l.notes,
              })),
            ),
            ctx.db
              .update(purchaseOrder)
              .set({ status: nextStatus })
              .where(and(eq(purchaseOrder.id, input.orderId), eq(purchaseOrder.status, po.status))),
            ctx.db.insert(activityLog).values(activity(ctx, "goods_receipt", id, "goods_received")),
            ...(nextStatus !== po.status
              ? [
                  ctx.db.insert(activityLog).values(
                    activity(ctx, "purchase_order", input.orderId, nextStatus, {
                      status: { from: po.status, to: nextStatus },
                      goodsReceipt: { from: null, to: grNumber },
                    }),
                  ),
                ]
              : []),
          ])
          return { id, grNumber, orderStatus: nextStatus }
        },
        () => conflict("Couldn't allocate a receipt number. Try again."),
      )
    }),

  /** Keeps the receipt for audit, stops it counting, and moves the PO back if needed. */
  void: procurementProcedure.input(reasonInput).mutation(async ({ ctx, input }) => {
    assertThat(canVoidReceipt(actorOf(ctx)), "Only Construction or Procurement managers can void deliveries.")
    const [receipt] = await ctx.db
      .select({
        voidedAt: goodsReceipt.voidedAt,
        grNumber: goodsReceipt.grNumber,
        orderId: goodsReceipt.purchaseOrderId,
        orderStatus: purchaseOrder.status,
      })
      .from(goodsReceipt)
      .innerJoin(purchaseOrder, eq(purchaseOrder.id, goodsReceipt.purchaseOrderId))
      .where(and(eq(goodsReceipt.id, input.id), eq(goodsReceipt.organizationId, ctx.orgId)))
    if (!receipt) throw notFound("Goods receipt")
    if (receipt.voidedAt) throw badRequest("This receipt is already voided.")
    if (receipt.orderStatus === "closed") throw badRequest("The purchase order is closed; its receipts can't change.")

    const [items, received] = await Promise.all([
      ctx.db
        .select({ id: purchaseOrderItem.id, quantity: purchaseOrderItem.quantity })
        .from(purchaseOrderItem)
        .where(eq(purchaseOrderItem.purchaseOrderId, receipt.orderId)),
      receivedByLine(ctx.db, receipt.orderId, input.id),
    ])
    const nextStatus = statusAfterReceipts(
      items.map((i) => ({ id: i.id, ordered: Number(i.quantity) })),
      received,
    )

    await runBatch(ctx.db, [
      ctx.db
        .update(goodsReceipt)
        .set({ voidedAt: new Date(), voidReason: input.reason, voidedById: ctx.session.user.id })
        .where(and(eq(goodsReceipt.id, input.id), isNull(goodsReceipt.voidedAt))),
      ctx.db
        .update(purchaseOrder)
        .set({ status: nextStatus })
        .where(and(eq(purchaseOrder.id, receipt.orderId), eq(purchaseOrder.status, receipt.orderStatus))),
      ctx.db
        .insert(activityLog)
        .values(activity(ctx, "goods_receipt", input.id, "voided", { reason: { from: null, to: input.reason } })),
      ...(nextStatus !== receipt.orderStatus
        ? [
            ctx.db.insert(activityLog).values(
              activity(ctx, "purchase_order", receipt.orderId, "receipt_voided", {
                status: { from: receipt.orderStatus, to: nextStatus },
                goodsReceipt: { from: null, to: receipt.grNumber },
              }),
            ),
          ]
        : []),
    ])
    return { id: input.id, orderStatus: nextStatus }
  }),
})
