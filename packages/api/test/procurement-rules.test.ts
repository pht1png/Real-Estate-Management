import { describe, expect, test } from "bun:test"

import {
  allowedPoActions,
  allowedPrActions,
  decidePoAction,
  decidePrAction,
  type OrgMember,
  type PoState,
  type PrState,
  canReceiveGoods,
  canVoidReceipt,
  poTotals,
  remainingByLine,
  seesAllRequests,
  statusAfterReceipts,
} from "../src/lib/procurement-rules"

const owner: OrgMember = { userId: "owner", role: "owner", departments: ["MGT"] }
const admin: OrgMember = { userId: "admin", role: "admin", departments: ["HR"] }
const conManager: OrgMember = { userId: "con-mgr", role: "manager", departments: ["CON"] }
const conMember: OrgMember = { userId: "con-1", role: "member", departments: ["CON"] }
const engMember: OrgMember = { userId: "eng-1", role: "member", departments: ["ENG"] }
const purManager: OrgMember = { userId: "pur-mgr", role: "manager", departments: ["PUR"] }
const purMember: OrgMember = { userId: "pur-1", role: "member", departments: ["PUR"] }
const smMember: OrgMember = { userId: "sm-1", role: "member", departments: ["SM"] }
const members = [owner, admin, conManager, conMember, engMember, purManager, purMember, smMember]

const pr = (o: Partial<PrState> = {}): PrState => ({
  status: "draft",
  requesterId: conMember.userId,
  department: "CON",
  approvalStep: null,
  lineCount: 2,
  ...o,
})
const po = (o: Partial<PoState> = {}): PoState => ({
  status: "draft",
  creatorId: purMember.userId,
  approvalStep: null,
  lineCount: 2,
  hasReceipts: false,
  ...o,
})
const prActionsFor = (state: PrState, actor: OrgMember, orgMembers = members) =>
  allowedPrActions({ pr: state, actor, members: orgMembers }).sort()
const poActionsFor = (state: PoState, actor: OrgMember, orgMembers = members) =>
  allowedPoActions({ po: state, actor, members: orgMembers }).sort()

describe("purchase requests", () => {
  test("submit goes to the department manager first", () => {
    expect(decidePrAction({ pr: pr(), action: "submit", actor: conMember, members })).toEqual({
      ok: true,
      to: "submitted",
      step: "manager",
      managerSkipped: false,
    })
  })

  test("manager step: CON manager or admin; not the owner, not other managers, not staff", () => {
    const waiting = pr({ status: "submitted", approvalStep: "manager" })
    expect(prActionsFor(waiting, conManager)).toEqual(["approve", "reject"])
    expect(prActionsFor(waiting, admin)).toEqual(["approve", "reject"])
    expect(prActionsFor(waiting, owner)).toEqual(["cancel"])
    expect(prActionsFor(waiting, purManager)).toEqual([])
    expect(prActionsFor(waiting, conMember)).toEqual(["cancel"])
  })

  test("manager approval moves to the owner step; only the owner decides it", () => {
    const waiting = pr({ status: "submitted", approvalStep: "manager" })
    expect(decidePrAction({ pr: waiting, action: "approve", actor: conManager, members })).toMatchObject({
      ok: true,
      to: "submitted",
      step: "owner",
    })
    const atOwner = pr({ status: "submitted", approvalStep: "owner" })
    expect(prActionsFor(atOwner, conManager)).toEqual([])
    expect(prActionsFor(atOwner, admin)).toEqual([])
    expect(decidePrAction({ pr: atOwner, action: "approve", actor: owner, members })).toMatchObject({
      ok: true,
      to: "approved",
      selfApproved: false,
    })
  })

  test("a manager can't approve their own request; with no other manager the step is skipped", () => {
    const own = pr({ requesterId: conManager.userId })
    const noAdmin = members.filter((m) => m !== admin)
    expect(decidePrAction({ pr: own, action: "submit", actor: conManager, members: noAdmin })).toMatchObject({
      step: "owner",
      managerSkipped: true,
    })
    // With an admin around, the admin takes the manager step
    expect(decidePrAction({ pr: own, action: "submit", actor: conManager, members })).toMatchObject({
      step: "manager",
    })
    expect(
      decidePrAction({
        pr: { ...own, status: "submitted", approvalStep: "manager" },
        action: "approve",
        actor: conManager,
        members,
      }),
    ).toMatchObject({ ok: false })
  })

  test("a department with no manager goes straight to the owner", () => {
    const engPr = pr({ requesterId: engMember.userId, department: "ENG" })
    expect(
      decidePrAction({ pr: engPr, action: "submit", actor: engMember, members: members.filter((m) => m !== admin) }),
    ).toMatchObject({ step: "owner", managerSkipped: true })
  })

  test("solo owner may approve their own request, flagged", () => {
    const solo = [owner]
    const own = pr({ status: "submitted", approvalStep: "owner", requesterId: owner.userId, department: "MGT" })
    expect(decidePrAction({ pr: own, action: "approve", actor: owner, members: solo })).toMatchObject({
      ok: true,
      to: "approved",
      selfApproved: true,
    })
    const twoOwners = [...solo, { userId: "owner-2", role: "owner", departments: ["MGT"] } satisfies OrgMember]
    expect(decidePrAction({ pr: own, action: "approve", actor: owner, members: twoOwners })).toMatchObject({
      ok: false,
    })
  })

  test("reject needs a reason at either step; revise and resubmit start at the manager again", () => {
    const waiting = pr({ status: "submitted", approvalStep: "owner" })
    expect(decidePrAction({ pr: waiting, action: "reject", actor: owner, members })).toMatchObject({ ok: false })
    expect(decidePrAction({ pr: waiting, action: "reject", actor: owner, members, comment: "No" })).toMatchObject({
      ok: true,
      to: "rejected",
    })
    expect(
      decidePrAction({ pr: pr({ status: "rejected" }), action: "revise", actor: conMember, members }),
    ).toMatchObject({
      ok: true,
      to: "draft",
    })
    expect(decidePrAction({ pr: pr(), action: "submit", actor: conMember, members })).toMatchObject({ step: "manager" })
  })

  test("drafts: only the requester edits and submits; submit needs lines and a department", () => {
    expect(prActionsFor(pr(), conMember)).toEqual(["cancel", "edit", "submit"])
    expect(prActionsFor(pr(), conManager)).toEqual([])
    expect(prActionsFor(pr(), owner)).toEqual(["cancel"])
    expect(decidePrAction({ pr: pr({ lineCount: 0 }), action: "submit", actor: conMember, members })).toMatchObject({
      ok: false,
    })
    expect(decidePrAction({ pr: pr({ department: null }), action: "submit", actor: conMember, members })).toMatchObject(
      {
        ok: false,
      },
    )
  })

  test("approved and ordered requests can't be cancelled", () => {
    expect(prActionsFor(pr({ status: "approved" }), conMember)).toEqual([])
    expect(prActionsFor(pr({ status: "ordered" }), owner)).toEqual([])
  })
})

describe("purchase orders", () => {
  test("Procurement drafts and submits; others can't", () => {
    expect(poActionsFor(po(), purMember)).toEqual(["cancel", "edit", "submit"])
    expect(poActionsFor(po(), conMember)).toEqual([])
    expect(poActionsFor(po(), smMember)).toEqual([])
  })

  test("manager step: a PUR manager (not the creator), then the owner", () => {
    const waiting = po({ status: "pending_approval", approvalStep: "manager" })
    expect(poActionsFor(waiting, purManager)).toEqual(["approve", "cancel", "reject"])
    expect(poActionsFor(waiting, conManager)).toEqual([])
    expect(decidePoAction({ po: waiting, action: "approve", actor: purManager, members })).toMatchObject({
      to: "pending_approval",
      step: "owner",
    })
    const atOwner = po({ status: "pending_approval", approvalStep: "owner" })
    expect(decidePoAction({ po: atOwner, action: "approve", actor: owner, members })).toMatchObject({ to: "approved" })
    expect(decidePoAction({ po: atOwner, action: "approve", actor: purManager, members })).toMatchObject({ ok: false })
  })

  test("the creator can't approve, even as a manager", () => {
    const own = po({ status: "pending_approval", approvalStep: "manager", creatorId: purManager.userId })
    expect(decidePoAction({ po: own, action: "approve", actor: purManager, members })).toMatchObject({ ok: false })
  })

  test("rejecting sends the PO back to draft", () => {
    const waiting = po({ status: "pending_approval", approvalStep: "manager" })
    expect(
      decidePoAction({ po: waiting, action: "reject", actor: purManager, members, comment: "Wrong price" }),
    ).toMatchObject({
      to: "draft",
    })
  })

  test("sent → close only after receiving; cancel blocked once goods arrived", () => {
    expect(poActionsFor(po({ status: "approved" }), purMember)).toEqual(["cancel", "markSent"])
    expect(poActionsFor(po({ status: "partially_received", hasReceipts: true }), purMember)).toEqual(["close"])
    expect(poActionsFor(po({ status: "sent", hasReceipts: true }), purMember)).toEqual([])
  })
})

describe("goods receipts", () => {
  const lines = [
    { id: "a", ordered: 10 },
    { id: "b", ordered: 2.5 },
  ]
  test("remaining per line", () => {
    expect(remainingByLine(lines, new Map([["a", 4]]))).toEqual(
      new Map([
        ["a", 6],
        ["b", 2.5],
      ]),
    )
  })
  test("status follows what arrived", () => {
    expect(statusAfterReceipts(lines, new Map())).toBe("sent")
    expect(statusAfterReceipts(lines, new Map([["a", 10]]))).toBe("partially_received")
    expect(
      statusAfterReceipts(
        lines,
        new Map([
          ["a", 10],
          ["b", 2.5],
        ]),
      ),
    ).toBe("received")
  })
})

describe("who receives, voids and sees", () => {
  test("receiving: CON, PUR, owner, admin; not ENG or SM", () => {
    expect([owner, admin, conMember, purMember].every(canReceiveGoods)).toBe(true)
    expect([engMember, smMember].some(canReceiveGoods)).toBe(false)
  })
  test("voiding: CON/PUR managers, owner, admin", () => {
    expect([owner, admin, conManager, purManager].every(canVoidReceipt)).toBe(true)
    expect([conMember, purMember].some(canVoidReceipt)).toBe(false)
  })
  test("PUR sees every request; CON members only theirs", () => {
    expect(seesAllRequests(purMember)).toBe(true)
    expect(seesAllRequests(conManager)).toBe(false)
  })
})

describe("PO totals", () => {
  test("VAT on the discounted subtotal", () => {
    expect(
      poTotals(
        [
          { quantity: 3, unitPrice: 100.5 },
          { quantity: 1.5, unitPrice: 10 },
        ],
        16.5,
        7,
      ),
    ).toEqual({
      subtotal: 316.5,
      discount: 16.5,
      vat: 21,
      total: 321,
    })
  })
})
