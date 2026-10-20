/**
 * Organization roles. Roles only control projects and org administration; what someone can *work on*
 * (sales, procurement, accounting…) comes from the department teams they belong to (see access.ts).
 */
import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access"

export const statement = {
  ...defaultStatements,
  project: ["read", "create", "update", "delete"],
  /** Cancel reservations and contracts, delete leads, contacts and draft contracts (team: Sales & Marketing). */
  sales: ["cancel"],
  /** Void a customer payment (team: Accounting & Finance). */
  payment: ["void"],
} as const

export type Permissions = {
  [K in keyof typeof statement]?: (typeof statement)[K][number][]
}

export const ac = createAccessControl(statement)

// Departments are a fixed set of teams, so nobody creates or deletes teams; owner/admin can still manage
// who is in them (team:update).
const departmentTeams = { team: ["update"] } as const

/** Full control, including creating and deleting projects. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  ...departmentTeams,
  project: ["read", "create", "update", "delete"],
  sales: ["cancel"],
  payment: ["void"],
})

/** Runs the organization (members, invitations, teams) and can update projects. */
export const admin = ac.newRole({
  ...adminAc.statements,
  ...departmentTeams,
  project: ["read", "update"],
  sales: ["cancel"],
  payment: ["void"],
})

/** Custom role: updates projects, and can cancel sales records and void payments in their teams. */
export const manager = ac.newRole({
  project: ["read", "update"],
  sales: ["cancel"],
  payment: ["void"],
})

export const member = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
})

export const roles = { owner, admin, manager, member }

export type RoleName = keyof typeof roles

export const parseRoles = (role: string | null | undefined): RoleName[] =>
  (role ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is RoleName => r in roles)

/** Whether any of the member's (comma-separated) roles grants `permission`. Pure, works in the browser too. */
export function roleCan(role: string | null | undefined, permission: Permissions) {
  return parseRoles(role).some((r) => roles[r].authorize(permission as never).success)
}

/** Owner and admin see and use every part of the app regardless of their teams. */
export const isOwnerOrAdmin = (role: string | null | undefined) =>
  parseRoles(role).some((r) => r === "owner" || r === "admin")
