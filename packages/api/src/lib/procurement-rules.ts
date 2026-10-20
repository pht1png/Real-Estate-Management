/**
 * Who may do what with purchase requests (PR) and purchase orders (PO). Pure, no database: the API calls it
 * before every transition, the web calls it to show the right buttons.
 *
 * Approval is two steps, whatever the amount:
 *   1. manager step: a manager in the right team (the PR's department; Procurement for POs), or an admin
 *   2. owner step: the owner
 * Nobody approves their own document. If no eligible manager exists, the manager step is skipped.
 * A solo owner may approve their own request at the owner step; that's flagged.
 */
import type { DepartmentCode } from "@real-estate-management/auth/access"
import { parseRoles } from "@real-estate-management/auth/permissions"

export type Step = "manager" | "owner"

export type OrgMember = { userId: string; role: string | null; departments: readonly DepartmentCode[] }

export type Denial = { ok: false; reason: string }
const deny = (reason: string): Denial => ({ ok: false, reason })

const hasRole = (m: OrgMember, role: "owner" | "admin" | "manager") => parseRoles(m.role).includes(role)

/** Manager-step approvers for a team: its managers, plus admins. Never `excludeUserId`. */
export function managerApprovers(members: readonly OrgMember[], team: DepartmentCode, excludeUserId: string | null) {
  return members.filter(
    (m) =>
      m.userId !== excludeUserId && (hasRole(m, "admin") || (hasRole(m, "manager") && m.departments.includes(team))),
  )
}

/** Owner-step approvers: owners other than `excludeUserId`. */
export const ownerApprovers = (members: readonly OrgMember[], excludeUserId: string | null) =>
  members.filter((m) => m.userId !== excludeUserId && hasRole(m, "owner"))

/** Shared approve/reject logic for both document types. */
function decideApproval(opts: {
  action: "approve" | "reject"
  step: Step | null
  team: DepartmentCode
  authorId: string | null
  actor: OrgMember
  members: readonly OrgMember[]
  comment?: string | null
}): { ok: true; step: Step; next: "owner" | "approved" | "rejected"; selfApproved: boolean } | Denial {
  const { step, actor } = opts
  if (!step) return deny("This document isn't waiting for approval.")
  if (opts.action === "reject" && !opts.comment?.trim()) return deny("Give a reason for rejecting.")

  if (step === "manager") {
    const allowed = managerApprovers(opts.members, opts.team, opts.authorId).some((m) => m.userId === actor.userId)
    if (!allowed) {
      return deny(
        actor.userId === opts.authorId ? "You can't approve your own document." : `Waiting on a ${opts.team} manager.`,
      )
    }
    return { ok: true, step, next: opts.action === "approve" ? "owner" : "rejected", selfApproved: false }
  }

  // Owner step
  if (!hasRole(actor, "owner")) return deny("Waiting on the owner.")
  const selfApproved = actor.userId === opts.authorId
  if (selfApproved && ownerApprovers(opts.members, actor.userId).length > 0) {
    return deny("You can't approve your own document.")
  }
  return { ok: true, step, next: opts.action === "approve" ? "approved" : "rejected", selfApproved }
}

// ─── Purchase requests ──────────────────────────────────────────────────────

export type PrStatus = "draft" | "submitted" | "approved" | "rejected" | "ordered" | "cancelled"
export type PrAction = "edit" | "submit" | "approve" | "reject" | "revise" | "cancel"
export const prActions: PrAction[] = ["edit", "submit", "approve", "reject", "revise", "cancel"]

export type PrState = {
  status: PrStatus
  requesterId: string | null
  department: DepartmentCode | null
  approvalStep: Step | null
  lineCount: number
}

export type PrDecision =
  | { ok: true; to: PrStatus; step?: Step | null; decidedStep?: Step; selfApproved?: boolean; managerSkipped?: boolean }
  | Denial

export function decidePrAction(input: {
  pr: PrState
  action: PrAction
  actor: OrgMember
  members: readonly OrgMember[]
  comment?: string | null
}): PrDecision {
  const { pr, action, actor } = input
  const isRequester = pr.requesterId !== null && pr.requesterId === actor.userId

  switch (action) {
    case "edit":
      if (pr.status !== "draft") return deny("Only drafts can be edited.")
      return isRequester ? { ok: true, to: "draft" } : deny("Only the requester can edit this request.")

    case "submit": {
      if (pr.status !== "draft") return deny("Only drafts can be submitted.")
      if (!isRequester) return deny("Only the requester can submit this request.")
      if (!pr.department) return deny("Pick the department this request is for.")
      if (pr.lineCount < 1) return deny("Add at least one item before submitting.")
      const managerSkipped = managerApprovers(input.members, pr.department, pr.requesterId).length === 0
      return { ok: true, to: "submitted", step: managerSkipped ? "owner" : "manager", managerSkipped }
    }

    case "approve":
    case "reject": {
      if (pr.status !== "submitted" || !pr.department)
        return deny("Only submitted requests can be approved or rejected.")
      const d = decideApproval({
        action,
        step: pr.approvalStep,
        team: pr.department,
        authorId: pr.requesterId,
        actor,
        members: input.members,
        comment: input.comment,
      })
      if (!d.ok) return d
      if (d.next === "owner") return { ok: true, to: "submitted", step: "owner", decidedStep: d.step }
      return { ok: true, to: d.next, step: null, decidedStep: d.step, selfApproved: d.selfApproved }
    }

    case "revise":
      if (pr.status !== "rejected") return deny("Only rejected requests can be revised.")
      return isRequester ? { ok: true, to: "draft", step: null } : deny("Only the requester can revise this request.")

    case "cancel":
      if (pr.status !== "draft" && pr.status !== "submitted")
        return deny("Only draft or submitted requests can be cancelled.")
      if (!isRequester && !hasRole(actor, "owner")) return deny("Only the requester can cancel this request.")
      return { ok: true, to: "cancelled", step: null }
  }
}

export const allowedPrActions = (input: { pr: PrState; actor: OrgMember; members: readonly OrgMember[] }) =>
  prActions.filter((action) => decidePrAction({ ...input, action, comment: "-" }).ok)

/** Can this member raise a request for this department? Members of it, or the owner/admin. */
export const canRequestFor = (actor: OrgMember, department: DepartmentCode) =>
  hasRole(actor, "owner") || hasRole(actor, "admin") || actor.departments.includes(department)

// ─── Purchase orders ────────────────────────────────────────────────────────

export type PoStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled"
export type PoAction = "edit" | "submit" | "approve" | "reject" | "markSent" | "close" | "cancel"
export const poActions: PoAction[] = ["edit", "submit", "approve", "reject", "markSent", "close", "cancel"]

export type PoState = {
  status: PoStatus
  creatorId: string | null
  approvalStep: Step | null
  lineCount: number
  /** Anything received yet (non-voided receipts). */
  hasReceipts: boolean
}

export type PoDecision =
  | { ok: true; to: PoStatus; step?: Step | null; decidedStep?: Step; selfApproved?: boolean; managerSkipped?: boolean }
  | Denial

/** Procurement work (create, send, close, cancel POs) is for the PUR team, the owner or an admin. */
export const isProcurementStaff = (actor: OrgMember) =>
  hasRole(actor, "owner") || hasRole(actor, "admin") || actor.departments.includes("PUR")

export function decidePoAction(input: {
  po: PoState
  action: PoAction
  actor: OrgMember
  members: readonly OrgMember[]
  comment?: string | null
}): PoDecision {
  const { po, action, actor } = input
  const staff = isProcurementStaff(actor)
  const notStaff = deny("Only Procurement can do this.")

  switch (action) {
    case "edit":
      if (po.status !== "draft") return deny("Only drafts can be edited.")
      return staff ? { ok: true, to: "draft" } : notStaff

    case "submit": {
      if (po.status !== "draft") return deny("Only drafts can be submitted.")
      if (!staff) return notStaff
      if (po.lineCount < 1) return deny("Add at least one line before submitting.")
      const managerSkipped = managerApprovers(input.members, "PUR", po.creatorId).length === 0
      return { ok: true, to: "pending_approval", step: managerSkipped ? "owner" : "manager", managerSkipped }
    }

    case "approve":
    case "reject": {
      if (po.status !== "pending_approval") return deny("Only purchase orders waiting for approval can be decided.")
      const d = decideApproval({
        action,
        step: po.approvalStep,
        team: "PUR",
        authorId: po.creatorId,
        actor,
        members: input.members,
        comment: input.comment,
      })
      if (!d.ok) return d
      if (d.next === "owner") return { ok: true, to: "pending_approval", step: "owner", decidedStep: d.step }
      // A rejected PO goes back to draft for Procurement to fix
      return {
        ok: true,
        to: d.next === "approved" ? "approved" : "draft",
        step: null,
        decidedStep: d.step,
        selfApproved: d.selfApproved,
      }
    }

    case "markSent":
      if (po.status !== "approved") return deny("Only approved purchase orders can be sent.")
      return staff ? { ok: true, to: "sent" } : notStaff

    case "close":
      if (po.status !== "received" && po.status !== "partially_received") {
        return deny("Only purchase orders with goods received can be closed.")
      }
      return staff ? { ok: true, to: "closed" } : notStaff

    case "cancel":
      if (["received", "partially_received", "closed", "cancelled"].includes(po.status) || po.hasReceipts) {
        return deny("Purchase orders with goods received can't be cancelled; close them instead.")
      }
      return staff ? { ok: true, to: "cancelled", step: null } : notStaff
  }
}

export const allowedPoActions = (input: { po: PoState; actor: OrgMember; members: readonly OrgMember[] }) =>
  poActions.filter((action) => decidePoAction({ ...input, action, comment: "-" }).ok)

/** PO totals as stored: subtotal Σ qty × price (rounded per line), discount, VAT on the discounted amount. */
export function poTotals(lines: readonly { quantity: number; unitPrice: number }[], discount: number, vatRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice * 100), 0) / 100
  const net = Math.max(0, subtotal - discount)
  const vat = Math.round(net * vatRate) / 100
  return { subtotal, discount, vat, total: Math.round((net + vat) * 100) / 100 }
}

// ─── Visibility ─────────────────────────────────────────────────────────────

/** Procurement, management, the owner and admins see every request; others see their departments' and their own. */
export const seesAllRequests = (actor: OrgMember) =>
  hasRole(actor, "owner") || hasRole(actor, "admin") || actor.departments.some((d) => d === "PUR" || d === "MGT")

// ─── Goods receipts ─────────────────────────────────────────────────────────

/** Construction (on site) or Procurement record what arrived; the owner and admins too. */
export const canReceiveGoods = (actor: OrgMember) =>
  hasRole(actor, "owner") || hasRole(actor, "admin") || actor.departments.some((d) => d === "CON" || d === "PUR")

/** Voiding a receipt: a manager in Construction or Procurement, or the owner/admin. */
export const canVoidReceipt = (actor: OrgMember) =>
  hasRole(actor, "owner") ||
  hasRole(actor, "admin") ||
  (hasRole(actor, "manager") && actor.departments.some((d) => d === "CON" || d === "PUR"))

/** POs that goods can be received against. */
export const receivableStatuses = ["approved", "sent", "partially_received"] as const satisfies PoStatus[]

/** Quantity still to receive per PO line, from ordered and already-received (non-voided) quantities. */
export function remainingByLine(
  lines: readonly { id: string; ordered: number }[],
  received: ReadonlyMap<string, number>,
) {
  return new Map(lines.map((l) => [l.id, Math.max(0, round3(l.ordered - (received.get(l.id) ?? 0)))]))
}

/** PO status after receipts change: nothing → back to sent, some → partially_received, all → received. */
export function statusAfterReceipts(
  lines: readonly { id: string; ordered: number }[],
  received: ReadonlyMap<string, number>,
): "sent" | "partially_received" | "received" {
  const total = (fn: (l: { id: string; ordered: number }) => number) => lines.reduce((sum, l) => sum + fn(l), 0)
  const receivedTotal = total((l) => Math.min(l.ordered, received.get(l.id) ?? 0))
  if (receivedTotal <= 0) return "sent"
  return lines.every((l) => (received.get(l.id) ?? 0) >= l.ordered) ? "received" : "partially_received"
}

const round3 = (n: number) => Math.round(n * 1000) / 1000
