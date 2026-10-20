import { type Access, type DepartmentCode, isDepartmentCode } from "@real-estate-management/auth/access"
import type { Database } from "@real-estate-management/db"
import { member, team, teamMember, user } from "@real-estate-management/db/schema/auth"
import {
  activityLog,
  budgetLine,
  type entityType,
  purchaseOrder,
  purchaseOrderItem,
  purchaseRequest,
} from "@real-estate-management/db/schema/index"
import { and, asc, eq, inArray, isNotNull, ne, or, type SQL, sum } from "drizzle-orm"

import { areaProcedure } from "../../index"
import { forbidden } from "../../lib/errors"
import { type OrgMember, seesAllRequests } from "../../lib/procurement-rules"

export { badRequest, conflict, forbidden, notFound, withNumberRetry } from "../../lib/errors"
export { nextDocumentNumber, runBatch } from "../../lib/db"
export * from "../../lib/inputs"

/** Procurement, Construction and Engineering teams (plus owner, admin, management). Finer checks are in the rules. */
export const procurementProcedure = areaProcedure("procurement")

/** What procurement procedures get in their context. */
export type ActorCtx = { db: Database; orgId: string; session: { user: { id: string } }; access: Access }

/** The current member, in the shape the rules take. */
export const actorOf = (ctx: { session: { user: { id: string } }; access: Access }): OrgMember => ({
  userId: ctx.session.user.id,
  role: ctx.access.role,
  departments: ctx.access.departments,
})

/** Every member of the org with their role and department teams, for deciding who may approve. */
export async function loadMembers(db: Database, orgId: string): Promise<OrgMember[]> {
  const [members, teams] = await Promise.all([
    db.select({ userId: member.userId, role: member.role }).from(member).where(eq(member.organizationId, orgId)),
    db
      .select({ userId: teamMember.userId, code: team.code })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(team.organizationId, orgId), isNotNull(team.code))),
  ])
  const departments = new Map<string, DepartmentCode[]>()
  for (const t of teams) {
    if (!isDepartmentCode(t.code)) continue
    departments.set(t.userId, [...(departments.get(t.userId) ?? []), t.code as DepartmentCode])
  }
  return members.map((m) => ({ ...m, departments: departments.get(m.userId) ?? [] }))
}

/** Department team ids by code for this org. */
export async function departmentTeamIds(db: Database, orgId: string) {
  const rows = await db
    .select({ id: team.id, code: team.code })
    .from(team)
    .where(and(eq(team.organizationId, orgId), isNotNull(team.code)))
  return new Map(rows.flatMap((r) => (isDepartmentCode(r.code) ? [[r.code as DepartmentCode, r.id] as const] : [])))
}

/** Which PRs the actor may see; undefined means all of them. */
export async function requestVisibility(db: Database, orgId: string, actor: OrgMember): Promise<SQL | undefined> {
  if (seesAllRequests(actor)) return undefined
  const teams = await departmentTeamIds(db, orgId)
  const teamIds = actor.departments.flatMap((code) => teams.get(code) ?? [])
  return or(
    eq(purchaseRequest.requestedById, actor.userId),
    teamIds.length ? inArray(purchaseRequest.departmentId, teamIds) : undefined,
  )
}

export const assertThat = (ok: boolean, message: string) => {
  if (!ok) throw forbidden(message)
}

// ─── Timeline ───────────────────────────────────────────────────────────────

type EntityType = (typeof entityType.enumValues)[number]
type Changes = Record<string, { from: unknown; to: unknown }>

/** An activity_log row (insert it in the same batch as the change it describes). */
export const activity = (
  ctx: { orgId: string; session: { user: { id: string } } },
  entityType: EntityType,
  entityId: string,
  action: string,
  changes?: Changes,
) => ({
  organizationId: ctx.orgId,
  userId: ctx.session.user.id,
  entityType,
  entityId,
  action,
  changes: changes ?? null,
})

/** `{ comment: { from: null, to: "..." } }` for notes that aren't a field change. */
export const note = (key: string, value: unknown): Changes => ({ [key]: { from: null, to: value } })

export async function loadTimeline(db: Database, orgId: string, entities: { type: EntityType; id: string }[]) {
  if (!entities.length) return []
  return db
    .select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      changes: activityLog.changes,
      createdAt: activityLog.createdAt,
      userName: user.name,
    })
    .from(activityLog)
    .leftJoin(user, eq(user.id, activityLog.userId))
    .where(
      and(
        eq(activityLog.organizationId, orgId),
        or(...entities.map((e) => and(eq(activityLog.entityType, e.type), eq(activityLog.entityId, e.id)))),
      ),
    )
    .orderBy(asc(activityLog.createdAt))
}

// ─── Budget ─────────────────────────────────────────────────────────────────

/** POs that count as committed spend against the budget. */
export const committedStatuses = ["approved", "sent", "partially_received", "received", "closed"] as const

/**
 * Budget lines this document would push over budget: budget vs committed POs plus this document's amount.
 * Warnings only; approval isn't blocked.
 */
export async function budgetWarnings(
  db: Database,
  lines: { budgetLineId: string | null; amount: number }[],
  excludeOrderId?: string,
) {
  const byLine = new Map<string, number>()
  for (const l of lines) if (l.budgetLineId) byLine.set(l.budgetLineId, (byLine.get(l.budgetLineId) ?? 0) + l.amount)
  const ids = [...byLine.keys()]
  if (!ids.length) return []

  const [budgets, committed] = await Promise.all([
    db
      .select({ id: budgetLine.id, code: budgetLine.code, name: budgetLine.name, budget: budgetLine.budgetAmount })
      .from(budgetLine)
      .where(inArray(budgetLine.id, ids)),
    db
      .select({ id: purchaseOrderItem.budgetLineId, amount: sum(purchaseOrderItem.amount) })
      .from(purchaseOrderItem)
      .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseOrderItem.purchaseOrderId))
      .where(
        and(
          inArray(purchaseOrderItem.budgetLineId, ids),
          inArray(purchaseOrder.status, [...committedStatuses]),
          excludeOrderId ? ne(purchaseOrder.id, excludeOrderId) : undefined,
        ),
      )
      .groupBy(purchaseOrderItem.budgetLineId),
  ])
  const committedBy = new Map(committed.map((c) => [c.id, Number(c.amount ?? 0)]))

  return budgets.flatMap((b) => {
    const budget = Number(b.budget)
    const already = committedBy.get(b.id) ?? 0
    const thisDocument = byLine.get(b.id) ?? 0
    const after = already + thisDocument
    return after > budget
      ? [
          {
            budgetLineId: b.id,
            code: b.code,
            name: b.name,
            budget,
            committed: already,
            thisDocument,
            over: after - budget,
          },
        ]
      : []
  })
}
