import type { DepartmentCode } from "@real-estate-management/auth/access"
import type { Database } from "@real-estate-management/db"
import { team, user } from "@real-estate-management/db/schema/auth"
import {
  activityLog,
  budgetLine,
  project,
  purchaseOrder,
  purchaseRequest,
  purchaseRequestItem,
  purchaseRequestStatus,
} from "@real-estate-management/db/schema/index"
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { z } from "zod"

import { router } from "../../index"
import {
  allowedPrActions,
  canRequestFor,
  decidePrAction,
  type OrgMember,
  type PrAction,
  type PrState,
} from "../../lib/procurement-rules"
import {
  type ActorCtx,
  activity,
  actorOf,
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
  requestVisibility,
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
  estimatedUnitPrice: moneyInput,
  budgetLineId: z.string().nullish(),
})

const requestFields = z.object({
  projectId: z.string().min(1, "Pick a project"),
  departmentId: z.string().min(1, "Pick a department"),
  neededBy: dateInput.nullish(),
  justification: optionalText(2000),
  notes: optionalText(2000),
  lines: z.array(lineInput).max(100),
})
type RequestFields = z.infer<typeof requestFields>

const lineAmount = (l: { quantity: number; estimatedUnitPrice: number }) =>
  Math.round(l.quantity * l.estimatedUnitPrice * 100) / 100
const estimateTotal = (lines: RequestFields["lines"]) =>
  lines.reduce((sum, l) => sum + Math.round(lineAmount(l) * 100), 0) / 100

/** Every id in the form belongs to this org, and the actor may raise requests for the department. */
async function validateRefs(db: Database, orgId: string, actor: OrgMember, v: RequestFields) {
  const budgetIds = [...new Set(v.lines.flatMap((l) => l.budgetLineId ?? []))]
  const [[proj], [dept], budgets] = await Promise.all([
    db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, v.projectId), eq(project.organizationId, orgId))),
    db
      .select({ code: team.code })
      .from(team)
      .where(and(eq(team.id, v.departmentId), eq(team.organizationId, orgId))),
    budgetIds.length
      ? db
          .select({ id: budgetLine.id })
          .from(budgetLine)
          .where(and(inArray(budgetLine.id, budgetIds), eq(budgetLine.projectId, v.projectId)))
      : Promise.resolve([]),
  ])
  if (!proj) throw notFound("Project")
  if (!dept?.code) throw notFound("Department")
  if (!canRequestFor(actor, dept.code as DepartmentCode)) {
    throw forbidden("You can only raise requests for your own department.")
  }
  if (budgets.length !== budgetIds.length) throw badRequest("A budget line doesn't belong to this project.")
}

const toRequestValues = (v: RequestFields) => ({
  projectId: v.projectId,
  departmentId: v.departmentId,
  neededBy: v.neededBy ?? null,
  justification: v.justification,
  notes: v.notes,
  estimatedTotal: toMoney(estimateTotal(v.lines)),
})

const toLineValues = (orgId: string, requestId: string, lines: RequestFields["lines"]) =>
  lines.map((l, i) => ({
    organizationId: orgId,
    purchaseRequestId: requestId,
    description: l.description,
    quantity: l.quantity.toFixed(3),
    unitOfMeasure: l.unitOfMeasure,
    estimatedUnitPrice: toMoney(l.estimatedUnitPrice),
    budgetLineId: l.budgetLineId || null,
    sortOrder: i,
  }))

/** What the rules need about a request, if the actor can see it. */
async function loadState(db: Database, orgId: string, id: string, actor: OrgMember) {
  const visible = await requestVisibility(db, orgId, actor)
  const [row] = await db
    .select({
      status: purchaseRequest.status,
      requesterId: purchaseRequest.requestedById,
      department: team.code,
      approvalStep: purchaseRequest.approvalStep,
      prNumber: purchaseRequest.prNumber,
      lineCount: db.$count(purchaseRequestItem, eq(purchaseRequestItem.purchaseRequestId, purchaseRequest.id)),
    })
    .from(purchaseRequest)
    .leftJoin(team, eq(team.id, purchaseRequest.departmentId))
    .where(and(eq(purchaseRequest.id, id), eq(purchaseRequest.organizationId, orgId), visible))
  if (!row) throw notFound("Purchase request")
  return { ...row, department: row.department as DepartmentCode | null } satisfies PrState & { prNumber: string }
}

/** Status (and step) the update is allowed from, so two people acting at once can't both win. */
const guard = (id: string, state: PrState) =>
  and(
    eq(purchaseRequest.id, id),
    eq(purchaseRequest.status, state.status),
    state.approvalStep ? eq(purchaseRequest.approvalStep, state.approvalStep) : isNull(purchaseRequest.approvalStep),
  )

const requester = alias(user, "requester")
const managerApprover = alias(user, "manager_approver")
const ownerApprover = alias(user, "owner_approver")

/** A request's lines with their budget lines. */
const loadLines = (db: Database, requestId: string) =>
  db
    .select({
      id: purchaseRequestItem.id,
      description: purchaseRequestItem.description,
      quantity: purchaseRequestItem.quantity,
      unitOfMeasure: purchaseRequestItem.unitOfMeasure,
      estimatedUnitPrice: purchaseRequestItem.estimatedUnitPrice,
      budgetLineId: purchaseRequestItem.budgetLineId,
      budgetLineCode: budgetLine.code,
      budgetLineName: budgetLine.name,
    })
    .from(purchaseRequestItem)
    .leftJoin(budgetLine, eq(budgetLine.id, purchaseRequestItem.budgetLineId))
    .where(eq(purchaseRequestItem.purchaseRequestId, requestId))
    .orderBy(asc(purchaseRequestItem.sortOrder))

/** Applies a decided transition: guarded update, then the timeline entry. */
async function transition(ctx: ActorCtx, id: string, action: PrAction, comment?: string | null) {
  const actor = actorOf(ctx)
  const [state, members] = await Promise.all([loadState(ctx.db, ctx.orgId, id, actor), loadMembers(ctx.db, ctx.orgId)])
  const decision = decidePrAction({ pr: state, action, actor, members, comment })
  if (!decision.ok) throw forbidden(decision.reason)

  const now = new Date()
  const userId = ctx.session.user.id
  let set: Partial<typeof purchaseRequest.$inferInsert> = { status: decision.to }
  let logAction: string = action
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
        set = { ...set, approvalStep: "owner", managerApprovedById: userId, managerApprovedAt: now }
        logAction = "manager_approved"
      } else {
        set = { ...set, approvalStep: null, approvedById: userId, approvedAt: now }
        logAction = "approved"
      }
      break
    case "reject":
      set = { ...set, approvalStep: null, rejectionReason: comment ?? null }
      logAction = "rejected"
      break
    case "revise":
      logAction = "revised"
      break
    case "cancel":
      set = { ...set, approvalStep: null, cancelReason: comment ?? null }
      logAction = "cancelled"
      break
    case "edit":
      throw badRequest("Use update to edit a request.")
  }

  const changes = {
    status: { from: state.status, to: decision.to },
    ...(state.approvalStep !== (set.approvalStep ?? state.approvalStep) && {
      step: { from: state.approvalStep, to: set.approvalStep ?? null },
    }),
    ...(comment && action !== "submit" && action !== "revise" ? note("comment", comment) : {}),
    ...(decision.managerSkipped ? note("managerSkipped", true) : {}),
    ...(decision.selfApproved ? note("selfApproved", true) : {}),
  }

  const [row] = await ctx.db
    .update(purchaseRequest)
    .set(set)
    .where(guard(id, state))
    .returning({ id: purchaseRequest.id })
  if (!row) throw conflict("This request was changed by someone else. Reload and try again.")
  await ctx.db.insert(activityLog).values(activity(ctx, "purchase_request", id, logAction, changes))

  const warnings =
    action === "approve"
      ? await budgetWarnings(
          ctx.db,
          (await loadLines(ctx.db, id)).map((l) => ({
            budgetLineId: l.budgetLineId,
            amount: Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0),
          })),
        )
      : []
  return { id, status: decision.to, step: set.approvalStep ?? null, budgetWarnings: warnings }
}

export const requestsRouter = router({
  list: procurementProcedure
    .input(
      listInput.extend({
        status: z.enum(purchaseRequestStatus.enumValues).optional(),
        projectId: z.string().optional(),
        departmentId: z.string().optional(),
        mine: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const actor = actorOf(ctx)
      const scope = and(
        eq(purchaseRequest.organizationId, ctx.orgId),
        await requestVisibility(ctx.db, ctx.orgId, actor),
      )
      const where = and(
        scope,
        input.status ? eq(purchaseRequest.status, input.status) : undefined,
        input.projectId ? eq(purchaseRequest.projectId, input.projectId) : undefined,
        input.departmentId ? eq(purchaseRequest.departmentId, input.departmentId) : undefined,
        input.mine ? eq(purchaseRequest.requestedById, actor.userId) : undefined,
        searchAny(searchTerm(input.search), purchaseRequest.prNumber, purchaseRequest.justification, project.name),
      )
      const { limit, offset } = paginate(input.page)

      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: purchaseRequest.id,
            prNumber: purchaseRequest.prNumber,
            status: purchaseRequest.status,
            approvalStep: purchaseRequest.approvalStep,
            estimatedTotal: purchaseRequest.estimatedTotal,
            neededBy: purchaseRequest.neededBy,
            justification: purchaseRequest.justification,
            createdAt: purchaseRequest.createdAt,
            projectName: project.name,
            departmentCode: team.code,
            departmentName: team.name,
            requesterName: requester.name,
          })
          .from(purchaseRequest)
          .innerJoin(project, eq(project.id, purchaseRequest.projectId))
          .leftJoin(team, eq(team.id, purchaseRequest.departmentId))
          .leftJoin(requester, eq(requester.id, purchaseRequest.requestedById))
          .where(where)
          .orderBy(desc(purchaseRequest.createdAt), desc(purchaseRequest.prNumber))
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(purchaseRequest)
          .innerJoin(project, eq(project.id, purchaseRequest.projectId))
          .where(where),
        ctx.db
          .select({ status: purchaseRequest.status, count: count() })
          .from(purchaseRequest)
          .where(scope)
          .groupBy(purchaseRequest.status),
      ])
      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE, statusCounts }
    }),

  /** Detail page: lines, approvals, timeline, linked POs and the actions the current user may take. */
  get: procurementProcedure.input(idInput).query(async ({ ctx, input }) => {
    const actor = actorOf(ctx)
    const visible = await requestVisibility(ctx.db, ctx.orgId, actor)
    const [pr] = await ctx.db
      .select({
        id: purchaseRequest.id,
        prNumber: purchaseRequest.prNumber,
        status: purchaseRequest.status,
        approvalStep: purchaseRequest.approvalStep,
        projectId: purchaseRequest.projectId,
        departmentId: purchaseRequest.departmentId,
        neededBy: purchaseRequest.neededBy,
        justification: purchaseRequest.justification,
        estimatedTotal: purchaseRequest.estimatedTotal,
        rejectionReason: purchaseRequest.rejectionReason,
        cancelReason: purchaseRequest.cancelReason,
        notes: purchaseRequest.notes,
        createdAt: purchaseRequest.createdAt,
        requestedById: purchaseRequest.requestedById,
        managerApprovedAt: purchaseRequest.managerApprovedAt,
        approvedAt: purchaseRequest.approvedAt,
        projectName: project.name,
        departmentCode: team.code,
        departmentName: team.name,
        requesterName: requester.name,
        managerApproverName: managerApprover.name,
        ownerApproverName: ownerApprover.name,
      })
      .from(purchaseRequest)
      .innerJoin(project, eq(project.id, purchaseRequest.projectId))
      .leftJoin(team, eq(team.id, purchaseRequest.departmentId))
      .leftJoin(requester, eq(requester.id, purchaseRequest.requestedById))
      .leftJoin(managerApprover, eq(managerApprover.id, purchaseRequest.managerApprovedById))
      .leftJoin(ownerApprover, eq(ownerApprover.id, purchaseRequest.approvedById))
      .where(and(eq(purchaseRequest.id, input.id), eq(purchaseRequest.organizationId, ctx.orgId), visible))
    if (!pr) throw notFound("Purchase request")

    const [lines, timeline, orders, members] = await Promise.all([
      loadLines(ctx.db, input.id),
      loadTimeline(ctx.db, ctx.orgId, [{ type: "purchase_request", id: input.id }]),
      ctx.db
        .select({ id: purchaseOrder.id, poNumber: purchaseOrder.poNumber, status: purchaseOrder.status })
        .from(purchaseOrder)
        .where(eq(purchaseOrder.purchaseRequestId, input.id))
        .orderBy(asc(purchaseOrder.poNumber)),
      loadMembers(ctx.db, ctx.orgId),
    ])

    const state: PrState = {
      status: pr.status,
      requesterId: pr.requestedById,
      department: pr.departmentCode as DepartmentCode | null,
      approvalStep: pr.approvalStep,
      lineCount: lines.length,
    }
    const actions = allowedPrActions({ pr: state, actor, members })
    const warnings = actions.includes("approve")
      ? await budgetWarnings(
          ctx.db,
          lines.map((l) => ({
            budgetLineId: l.budgetLineId,
            amount: Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0),
          })),
        )
      : []

    return { ...pr, lines, timeline, orders, actions, budgetWarnings: warnings }
  }),

  create: procurementProcedure.input(requestFields).mutation(async ({ ctx, input }) => {
    const actor = actorOf(ctx)
    await validateRefs(ctx.db, ctx.orgId, actor, input)
    const id = crypto.randomUUID()
    return withNumberRetry(
      async () => {
        const prNumber = await nextDocumentNumber(ctx.db, {
          table: purchaseRequest,
          column: purchaseRequest.prNumber,
          orgColumn: purchaseRequest.organizationId,
          orgId: ctx.orgId,
          prefix: "PR",
        })
        await runBatch(ctx.db, [
          ctx.db.insert(purchaseRequest).values({
            id,
            organizationId: ctx.orgId,
            prNumber,
            requestedById: actor.userId,
            ...toRequestValues(input),
          }),
          ...(input.lines.length
            ? [ctx.db.insert(purchaseRequestItem).values(toLineValues(ctx.orgId, id, input.lines))]
            : []),
          ctx.db.insert(activityLog).values(activity(ctx, "purchase_request", id, "created")),
        ])
        return { id, prNumber }
      },
      () => conflict("Couldn't allocate a request number. Try again."),
    )
  }),

  /** Drafts only, by the requester; the lines are replaced. */
  update: procurementProcedure.input(idInput.extend(requestFields.shape)).mutation(async ({ ctx, input }) => {
    const actor = actorOf(ctx)
    const { id, ...fields } = input
    const [state, members] = await Promise.all([
      loadState(ctx.db, ctx.orgId, id, actor),
      loadMembers(ctx.db, ctx.orgId),
    ])
    const decision = decidePrAction({ pr: state, action: "edit", actor, members })
    if (!decision.ok) throw forbidden(decision.reason)
    await validateRefs(ctx.db, ctx.orgId, actor, fields)

    await runBatch(ctx.db, [
      ctx.db.update(purchaseRequest).set(toRequestValues(fields)).where(guard(id, state)),
      ctx.db.delete(purchaseRequestItem).where(eq(purchaseRequestItem.purchaseRequestId, id)),
      ...(fields.lines.length
        ? [ctx.db.insert(purchaseRequestItem).values(toLineValues(ctx.orgId, id, fields.lines))]
        : []),
      ctx.db.insert(activityLog).values(activity(ctx, "purchase_request", id, "updated")),
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
  revise: procurementProcedure.input(idInput).mutation(({ ctx, input }) => transition(ctx, input.id, "revise")),
  cancel: procurementProcedure
    .input(reasonInput)
    .mutation(({ ctx, input }) => transition(ctx, input.id, "cancel", input.reason)),
})
