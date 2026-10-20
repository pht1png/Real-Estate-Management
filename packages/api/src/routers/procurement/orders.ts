import type { Database } from "@real-estate-management/db"
import { user } from "@real-estate-management/db/schema/auth"
import {
  activityLog,
  budgetLine,
  goodsReceipt,
  goodsReceiptItem,
  project,
  purchaseOrder,
  purchaseOrderItem,
  purchaseOrderStatus,
  purchaseRequest,
  purchaseRequestItem,
  supplier,
} from "@real-estate-management/db/schema/index"
import { and, asc, count, desc, eq, inArray, isNull, ne, sum } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import { router } from "../../index"
import {
  allowedPoActions,
  canReceiveGoods,
  decidePoAction,
  isProcurementStaff,
  type PoAction,
  type PoState,
  poTotals,
  receivableStatuses,
  remainingByLine,
} from "../../lib/procurement-rules"
import {
  type ActorCtx,
  activity,
  actorOf,
  assertThat,
  badRequest,
  budgetWarnings,
  conflict,
  dateInput,
  forbidden,
  idInput,
  listInput,
  loadMembers,
  loadTimeline,
  moneyInput,
  nextDocumentNumber,
  note,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  procurementProcedure,
  reasonInput,
  runBatch,
  searchAny,
  searchTerm,
  toMoney,
  withNumberRetry,
} from "./shared"

const lineInput = z.object({
  description: z.string().trim().min(1, "Describe the item").max(300),
  quantity: z.number().positive("Quantity must be more than zero").max(1_000_000_000),
  unitOfMeasure: z.string().trim().min(1, "Unit is required").max(30),
  unitPrice: moneyInput,
  budgetLineId: z.string().nullish(),
  /** The request line this came from, when ordering from a PR. */
  purchaseRequestItemId: z.string().nullish(),
})

const orderFields = z.object({
  supplierId: z.string().min(1, "Pick a supplier"),
  orderDate: dateInput,
  expectedDeliveryDate: dateInput.nullish(),
  deliveryAddress: optionalText(500),
  discountAmount: moneyInput.default(0),
  vatRate: z.number().min(0).max(30).default(7),
  /** Expected withholding tax, e.g. 3% on subcontracted services. */
  whtRate: z.number().min(0).max(15).default(0),
  notes: optionalText(2000),
  lines: z.array(lineInput).min(1, "Add at least one line").max(100),
})
type OrderFields = z.infer<typeof orderFields>

/** Every id in the form belongs to this org: project, active supplier, the project's budget lines, the PR's lines. */
async function validateRefs(
  db: Database,
  orgId: string,
  projectId: string,
  v: OrderFields,
  purchaseRequestId: string | null,
) {
  const budgetIds = [...new Set(v.lines.flatMap((l) => l.budgetLineId ?? []))]
  const requestItemIds = [...new Set(v.lines.flatMap((l) => l.purchaseRequestItemId ?? []))]
  const [[proj], [sup], budgets, requestItems] = await Promise.all([
    db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, projectId), eq(project.organizationId, orgId))),
    db
      .select({ isActive: supplier.isActive })
      .from(supplier)
      .where(and(eq(supplier.id, v.supplierId), eq(supplier.organizationId, orgId))),
    budgetIds.length
      ? db
          .select({ id: budgetLine.id })
          .from(budgetLine)
          .where(and(inArray(budgetLine.id, budgetIds), eq(budgetLine.projectId, projectId)))
      : Promise.resolve([]),
    requestItemIds.length && purchaseRequestId
      ? db
          .select({ id: purchaseRequestItem.id })
          .from(purchaseRequestItem)
          .where(
            and(
              inArray(purchaseRequestItem.id, requestItemIds),
              eq(purchaseRequestItem.purchaseRequestId, purchaseRequestId),
            ),
          )
      : Promise.resolve([]),
  ])
  if (!proj) throw notFound("Project")
  if (!sup) throw notFound("Supplier")
  if (!sup.isActive) throw badRequest("That supplier is inactive.")
  if (budgets.length !== budgetIds.length) throw badRequest("A budget line doesn't belong to this project.")
  if (requestItems.length !== requestItemIds.length) throw badRequest("A line doesn't belong to this request.")
}

const toOrderValues = (v: OrderFields) => {
  const totals = poTotals(v.lines, v.discountAmount, v.vatRate)
  if (v.discountAmount > totals.subtotal) throw badRequest("The discount is more than the subtotal.")
  return {
    supplierId: v.supplierId,
    orderDate: v.orderDate,
    expectedDeliveryDate: v.expectedDeliveryDate ?? null,
    deliveryAddress: v.deliveryAddress,
    subtotal: toMoney(totals.subtotal),
    discountAmount: toMoney(totals.discount),
    vatRate: v.vatRate.toFixed(2),
    vatAmount: toMoney(totals.vat),
    whtRate: v.whtRate.toFixed(2),
    total: toMoney(totals.total),
    notes: v.notes,
  }
}

const toLineValues = (orgId: string, orderId: string, lines: OrderFields["lines"]) =>
  lines.map((l, i) => ({
    organizationId: orgId,
    purchaseOrderId: orderId,
    purchaseRequestItemId: l.purchaseRequestItemId || null,
    budgetLineId: l.budgetLineId || null,
    description: l.description,
    quantity: l.quantity.toFixed(3),
    unitOfMeasure: l.unitOfMeasure,
    unitPrice: toMoney(l.unitPrice),
    sortOrder: i,
  }))

/** Received quantity per PO line from non-voided receipts. */
export async function receivedByLine(db: Database, orderId: string, excludeReceiptId?: string) {
  const rows = await db
    .select({ itemId: goodsReceiptItem.purchaseOrderItemId, received: sum(goodsReceiptItem.quantityReceived) })
    .from(goodsReceiptItem)
    .innerJoin(goodsReceipt, eq(goodsReceipt.id, goodsReceiptItem.goodsReceiptId))
    .where(
      and(
        eq(goodsReceipt.purchaseOrderId, orderId),
        isNull(goodsReceipt.voidedAt),
        excludeReceiptId ? ne(goodsReceipt.id, excludeReceiptId) : undefined,
      ),
    )
    .groupBy(goodsReceiptItem.purchaseOrderItemId)
  return new Map(rows.map((r) => [r.itemId, Number(r.received ?? 0)]))
}

async function loadState(db: Database, orgId: string, id: string) {
  const [row] = await db
    .select({
      status: purchaseOrder.status,
      creatorId: purchaseOrder.createdById,
      approvalStep: purchaseOrder.approvalStep,
      poNumber: purchaseOrder.poNumber,
      projectId: purchaseOrder.projectId,
      purchaseRequestId: purchaseOrder.purchaseRequestId,
      lineCount: db.$count(purchaseOrderItem, eq(purchaseOrderItem.purchaseOrderId, purchaseOrder.id)),
      receiptCount: db.$count(
        goodsReceipt,
        and(eq(goodsReceipt.purchaseOrderId, purchaseOrder.id), isNull(goodsReceipt.voidedAt)),
      ),
    })
    .from(purchaseOrder)
    .where(and(eq(purchaseOrder.id, id), eq(purchaseOrder.organizationId, orgId)))
  if (!row) throw notFound("Purchase order")
  return { ...row, hasReceipts: row.receiptCount > 0 } satisfies PoState & { poNumber: string }
}

const guard = (id: string, state: PoState) =>
  and(
    eq(purchaseOrder.id, id),
    eq(purchaseOrder.status, state.status),
    state.approvalStep ? eq(purchaseOrder.approvalStep, state.approvalStep) : isNull(purchaseOrder.approvalStep),
  )

const loadLines = (db: Database, orderId: string) =>
  db
    .select({
      id: purchaseOrderItem.id,
      description: purchaseOrderItem.description,
      quantity: purchaseOrderItem.quantity,
      unitOfMeasure: purchaseOrderItem.unitOfMeasure,
      unitPrice: purchaseOrderItem.unitPrice,
      amount: purchaseOrderItem.amount,
      budgetLineId: purchaseOrderItem.budgetLineId,
      purchaseRequestItemId: purchaseOrderItem.purchaseRequestItemId,
      budgetLineCode: budgetLine.code,
      budgetLineName: budgetLine.name,
    })
    .from(purchaseOrderItem)
    .leftJoin(budgetLine, eq(budgetLine.id, purchaseOrderItem.budgetLineId))
    .where(eq(purchaseOrderItem.purchaseOrderId, orderId))
    .orderBy(asc(purchaseOrderItem.sortOrder))

const orderWarnings = async (db: Database, id: string) =>
  budgetWarnings(
    db,
    (await loadLines(db, id)).map((l) => ({ budgetLineId: l.budgetLineId, amount: Number(l.amount ?? 0) })),
    id,
  )

async function transition(ctx: ActorCtx, id: string, action: PoAction, comment?: string | null) {
  const actor = actorOf(ctx)
  const [state, members] = await Promise.all([loadState(ctx.db, ctx.orgId, id), loadMembers(ctx.db, ctx.orgId)])
  const decision = decidePoAction({ po: state, action, actor, members, comment })
  if (!decision.ok) throw forbidden(decision.reason)

  const now = new Date()
  let set: Partial<typeof purchaseOrder.$inferInsert> = { status: decision.to }
  let logAction: string
  switch (action) {
    case "submit":
      set = {
        ...set,
        approvalStep: decision.step ?? null,
        managerApprovedById: null,
        managerApprovedAt: null,
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
      }
      logAction = "submitted"
      break
    case "approve":
      if (decision.decidedStep === "manager") {
        set = { ...set, approvalStep: "owner", managerApprovedById: actor.userId, managerApprovedAt: now }
        logAction = "manager_approved"
      } else {
        set = { ...set, approvalStep: null, approvedById: actor.userId, approvedAt: now }
        logAction = "approved"
      }
      break
    case "reject":
      set = { ...set, approvalStep: null, rejectionReason: comment ?? null }
      logAction = "rejected"
      break
    case "markSent":
      logAction = "sent"
      break
    case "close":
      logAction = "closed"
      break
    case "cancel":
      set = { ...set, approvalStep: null, cancelReason: comment ?? null }
      logAction = "cancelled"
      break
    case "edit":
      throw badRequest("Use update to edit a purchase order.")
  }

  const changes = {
    status: { from: state.status, to: decision.to },
    ...(set.approvalStep !== undefined &&
      set.approvalStep !== state.approvalStep && { step: { from: state.approvalStep, to: set.approvalStep } }),
    ...(comment && action !== "submit" ? note("comment", comment) : {}),
    ...(decision.managerSkipped ? note("managerSkipped", true) : {}),
    ...(decision.selfApproved ? note("selfApproved", true) : {}),
  }

  const [row] = await ctx.db.update(purchaseOrder).set(set).where(guard(id, state)).returning({ id: purchaseOrder.id })
  if (!row) throw conflict("This purchase order was changed by someone else. Reload and try again.")

  const writes: BatchItem<"pg">[] = [
    ctx.db.insert(activityLog).values(activity(ctx, "purchase_order", id, logAction, changes)),
  ]
  // A cancelled PO frees its request to be ordered again, unless another PO still covers it
  if (action === "cancel" && state.purchaseRequestId) {
    const [others] = await ctx.db
      .select({ n: count() })
      .from(purchaseOrder)
      .where(
        and(
          eq(purchaseOrder.purchaseRequestId, state.purchaseRequestId),
          ne(purchaseOrder.id, id),
          ne(purchaseOrder.status, "cancelled"),
        ),
      )
    if (!others?.n) {
      writes.push(
        ctx.db
          .update(purchaseRequest)
          .set({ status: "approved" })
          .where(and(eq(purchaseRequest.id, state.purchaseRequestId), eq(purchaseRequest.status, "ordered"))),
        ctx.db.insert(activityLog).values(
          activity(ctx, "purchase_request", state.purchaseRequestId, "order_cancelled", {
            status: { from: "ordered", to: "approved" },
            ...note("purchaseOrder", state.poNumber),
          }),
        ),
      )
    }
  }
  await runBatch(ctx.db, writes)

  const warnings = action === "approve" ? await orderWarnings(ctx.db, id) : []
  return { id, status: decision.to, step: set.approvalStep ?? null, budgetWarnings: warnings }
}

/** Takes the next PO number and inserts the PO with its lines and a "created" entry, retrying on a number clash. */
function insertOrder(
  ctx: ActorCtx,
  values: { projectId: string; purchaseRequestId: string | null } & OrderFields,
  extra: BatchItem<"pg">[] = [],
) {
  const id = crypto.randomUUID()
  const { projectId, purchaseRequestId, ...fields } = values
  const orderValues = toOrderValues(fields)
  return withNumberRetry(
    async () => {
      const poNumber = await nextDocumentNumber(ctx.db, {
        table: purchaseOrder,
        column: purchaseOrder.poNumber,
        orgColumn: purchaseOrder.organizationId,
        orgId: ctx.orgId,
        prefix: "PO",
      })
      await runBatch(ctx.db, [
        ctx.db.insert(purchaseOrder).values({
          id,
          organizationId: ctx.orgId,
          poNumber,
          projectId,
          purchaseRequestId,
          createdById: ctx.session.user.id,
          ...orderValues,
        }),
        ctx.db.insert(purchaseOrderItem).values(toLineValues(ctx.orgId, id, fields.lines)),
        ctx.db.insert(activityLog).values(activity(ctx, "purchase_order", id, "created")),
        ...extra,
      ])
      return { id, poNumber }
    },
    () => conflict("Couldn't allocate a purchase order number. Try again."),
  )
}

/** Procurement (or owner/admin) creates and edits purchase orders. */
const staffOnly = procurementProcedure.use(({ ctx, next }) => {
  assertThat(isProcurementStaff(actorOf(ctx)), "Only Procurement can do this.")
  return next()
})

const creator = alias(user, "creator")
const managerApprover = alias(user, "manager_approver")
const ownerApprover = alias(user, "owner_approver")
const receiver = alias(user, "receiver")

export const ordersRouter = router({
  list: procurementProcedure
    .input(
      listInput.extend({
        status: z.enum(purchaseOrderStatus.enumValues).optional(),
        projectId: z.string().optional(),
        supplierId: z.string().optional(),
        /** Only POs goods can be received against. */
        receivable: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = eq(purchaseOrder.organizationId, ctx.orgId)
      const where = and(
        scope,
        input.status ? eq(purchaseOrder.status, input.status) : undefined,
        input.receivable ? inArray(purchaseOrder.status, [...receivableStatuses]) : undefined,
        input.projectId ? eq(purchaseOrder.projectId, input.projectId) : undefined,
        input.supplierId ? eq(purchaseOrder.supplierId, input.supplierId) : undefined,
        searchAny(searchTerm(input.search), purchaseOrder.poNumber, supplier.name, project.name),
      )
      const { limit, offset } = paginate(input.page)
      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: purchaseOrder.id,
            poNumber: purchaseOrder.poNumber,
            status: purchaseOrder.status,
            approvalStep: purchaseOrder.approvalStep,
            orderDate: purchaseOrder.orderDate,
            expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
            total: purchaseOrder.total,
            projectName: project.name,
            supplierName: supplier.name,
            prNumber: purchaseRequest.prNumber,
            creatorName: creator.name,
          })
          .from(purchaseOrder)
          .innerJoin(project, eq(project.id, purchaseOrder.projectId))
          .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
          .leftJoin(purchaseRequest, eq(purchaseRequest.id, purchaseOrder.purchaseRequestId))
          .leftJoin(creator, eq(creator.id, purchaseOrder.createdById))
          .where(where)
          .orderBy(desc(purchaseOrder.orderDate), desc(purchaseOrder.poNumber))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(purchaseOrder)
          .innerJoin(project, eq(project.id, purchaseOrder.projectId))
          .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
          .where(where),
        ctx.db
          .select({ status: purchaseOrder.status, count: count(), total: sum(purchaseOrder.total) })
          .from(purchaseOrder)
          .where(scope)
          .groupBy(purchaseOrder.status),
      ])
      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE, statusCounts }
    }),

  /** Detail page: lines with ordered/received/remaining, receipts, timeline and allowed actions. */
  get: procurementProcedure.input(idInput).query(async ({ ctx, input }) => {
    const [po] = await ctx.db
      .select({
        id: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        status: purchaseOrder.status,
        approvalStep: purchaseOrder.approvalStep,
        projectId: purchaseOrder.projectId,
        supplierId: purchaseOrder.supplierId,
        purchaseRequestId: purchaseOrder.purchaseRequestId,
        orderDate: purchaseOrder.orderDate,
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
        deliveryAddress: purchaseOrder.deliveryAddress,
        subtotal: purchaseOrder.subtotal,
        discountAmount: purchaseOrder.discountAmount,
        vatRate: purchaseOrder.vatRate,
        vatAmount: purchaseOrder.vatAmount,
        whtRate: purchaseOrder.whtRate,
        total: purchaseOrder.total,
        rejectionReason: purchaseOrder.rejectionReason,
        cancelReason: purchaseOrder.cancelReason,
        notes: purchaseOrder.notes,
        createdById: purchaseOrder.createdById,
        createdAt: purchaseOrder.createdAt,
        managerApprovedAt: purchaseOrder.managerApprovedAt,
        approvedAt: purchaseOrder.approvedAt,
        projectName: project.name,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        prNumber: purchaseRequest.prNumber,
        creatorName: creator.name,
        managerApproverName: managerApprover.name,
        ownerApproverName: ownerApprover.name,
      })
      .from(purchaseOrder)
      .innerJoin(project, eq(project.id, purchaseOrder.projectId))
      .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
      .leftJoin(purchaseRequest, eq(purchaseRequest.id, purchaseOrder.purchaseRequestId))
      .leftJoin(creator, eq(creator.id, purchaseOrder.createdById))
      .leftJoin(managerApprover, eq(managerApprover.id, purchaseOrder.managerApprovedById))
      .leftJoin(ownerApprover, eq(ownerApprover.id, purchaseOrder.approvedById))
      .where(and(eq(purchaseOrder.id, input.id), eq(purchaseOrder.organizationId, ctx.orgId)))
    if (!po) throw notFound("Purchase order")

    const [lines, received, receipts, members] = await Promise.all([
      loadLines(ctx.db, input.id),
      receivedByLine(ctx.db, input.id),
      ctx.db
        .select({
          id: goodsReceipt.id,
          grNumber: goodsReceipt.grNumber,
          receivedOn: goodsReceipt.receivedOn,
          deliveryNoteNumber: goodsReceipt.deliveryNoteNumber,
          voidedAt: goodsReceipt.voidedAt,
          voidReason: goodsReceipt.voidReason,
          receiverName: receiver.name,
        })
        .from(goodsReceipt)
        .leftJoin(receiver, eq(receiver.id, goodsReceipt.receivedById))
        .where(eq(goodsReceipt.purchaseOrderId, input.id))
        .orderBy(asc(goodsReceipt.receivedOn), asc(goodsReceipt.grNumber)),
      loadMembers(ctx.db, ctx.orgId),
    ])
    const timeline = await loadTimeline(ctx.db, ctx.orgId, [
      { type: "purchase_order", id: input.id },
      ...receipts.map((r) => ({ type: "goods_receipt" as const, id: r.id })),
    ])

    const remaining = remainingByLine(
      lines.map((l) => ({ id: l.id, ordered: Number(l.quantity) })),
      received,
    )
    const actor = actorOf(ctx)
    const state: PoState = {
      status: po.status,
      creatorId: po.createdById,
      approvalStep: po.approvalStep,
      lineCount: lines.length,
      hasReceipts: receipts.some((r) => !r.voidedAt),
    }
    const actions = allowedPoActions({ po: state, actor, members })

    return {
      ...po,
      lines: lines.map((l) => ({ ...l, received: received.get(l.id) ?? 0, remaining: remaining.get(l.id) ?? 0 })),
      receipts,
      timeline,
      actions,
      canReceive:
        canReceiveGoods(actor) &&
        (receivableStatuses as readonly string[]).includes(po.status) &&
        [...remaining.values()].some((n) => n > 0),
      budgetWarnings: actions.includes("approve") ? await orderWarnings(ctx.db, input.id) : [],
    }
  }),

  /** Orders an approved request: copies the project, links the lines, and marks the request ordered. */
  createFromRequest: staffOnly
    .input(orderFields.extend({ requestId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { requestId, ...fields } = input
      const [pr] = await ctx.db
        .select({
          status: purchaseRequest.status,
          projectId: purchaseRequest.projectId,
          prNumber: purchaseRequest.prNumber,
        })
        .from(purchaseRequest)
        .where(and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.organizationId, ctx.orgId)))
      if (!pr) throw notFound("Purchase request")
      if (pr.status !== "approved") throw badRequest("Only approved requests can be ordered.")
      await validateRefs(ctx.db, ctx.orgId, pr.projectId, fields, requestId)

      // Claim the request first so two people can't order it at once; give it back if the PO can't be saved
      const [claimed] = await ctx.db
        .update(purchaseRequest)
        .set({ status: "ordered" })
        .where(and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.status, "approved")))
        .returning({ id: purchaseRequest.id })
      if (!claimed) throw conflict("This request was just ordered by someone else.")

      try {
        const order = await insertOrder(ctx, { ...fields, projectId: pr.projectId, purchaseRequestId: requestId })
        await ctx.db.insert(activityLog).values(
          activity(ctx, "purchase_request", requestId, "ordered", {
            status: { from: "approved", to: "ordered" },
            ...note("purchaseOrder", order.poNumber),
          }),
        )
        return order
      } catch (error) {
        await ctx.db
          .update(purchaseRequest)
          .set({ status: "approved" })
          .where(and(eq(purchaseRequest.id, requestId), eq(purchaseRequest.status, "ordered")))
        throw error
      }
    }),

  /** A PO without a request, e.g. subcontracted services. */
  create: staffOnly
    .input(orderFields.extend({ projectId: z.string().min(1, "Pick a project") }))
    .mutation(async ({ ctx, input }) => {
      const lines = input.lines.map((l) => ({ ...l, purchaseRequestItemId: null }))
      await validateRefs(ctx.db, ctx.orgId, input.projectId, { ...input, lines }, null)
      return insertOrder(ctx, { ...input, lines, purchaseRequestId: null })
    }),

  /** Drafts only (new, or sent back by an approver); the lines are replaced. */
  update: staffOnly.input(idInput.extend(orderFields.shape)).mutation(async ({ ctx, input }) => {
    const actor = actorOf(ctx)
    const { id, ...fields } = input
    const [state, members] = await Promise.all([loadState(ctx.db, ctx.orgId, id), loadMembers(ctx.db, ctx.orgId)])
    const decision = decidePoAction({ po: state, action: "edit", actor, members })
    if (!decision.ok) throw forbidden(decision.reason)
    await validateRefs(ctx.db, ctx.orgId, state.projectId, fields, state.purchaseRequestId)

    await runBatch(ctx.db, [
      ctx.db.update(purchaseOrder).set(toOrderValues(fields)).where(guard(id, state)),
      ctx.db.delete(purchaseOrderItem).where(eq(purchaseOrderItem.purchaseOrderId, id)),
      ctx.db.insert(purchaseOrderItem).values(toLineValues(ctx.orgId, id, fields.lines)),
      ctx.db.insert(activityLog).values(activity(ctx, "purchase_order", id, "updated")),
    ])
    return { id }
  }),

  submit: procurementProcedure.input(idInput).mutation(({ ctx, input }) => transition(ctx, input.id, "submit")),
  approve: procurementProcedure
    .input(idInput.extend({ comment: optionalText(1000) }))
    .mutation(({ ctx, input }) => transition(ctx, input.id, "approve", input.comment)),
  reject: procurementProcedure
    .input(reasonInput)
    .mutation(({ ctx, input }) => transition(ctx, input.id, "reject", input.reason)),
  markSent: procurementProcedure.input(idInput).mutation(({ ctx, input }) => transition(ctx, input.id, "markSent")),
  close: procurementProcedure.input(idInput).mutation(({ ctx, input }) => transition(ctx, input.id, "close")),
  cancel: procurementProcedure
    .input(reasonInput)
    .mutation(({ ctx, input }) => transition(ctx, input.id, "cancel", input.reason)),
})
