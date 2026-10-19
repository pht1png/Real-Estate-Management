import { createAccessControl } from "better-auth/plugins/access"
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access"

export const statement = {
  ...defaultStatements,
  project: ["read", "create", "share", "update", "delete"],
  sales: ["read", "create", "update", "delete"],
  procurement: ["read", "create", "update", "delete"],
  aftersales: ["read", "create", "update", "delete"],
} as const

export type Permissions = {
  [K in keyof typeof statement]?: (typeof statement)[K][number][]
}

export const ac = createAccessControl(statement)

export const member = ac.newRole({
  ...memberAc.statements,
  project: ["read", "create"],
})

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["read", "create", "share", "update"],
  sales: ["read", "create", "update", "delete"],
  procurement: ["read", "create", "update", "delete"],
  aftersales: ["read", "create", "update", "delete"],
})

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["read", "create", "share", "update", "delete"],
  sales: ["read", "create", "update", "delete"],
  procurement: ["read", "create", "update", "delete"],
  aftersales: ["read", "create", "update", "delete"],
})

export const salesperson = ac.newRole({
  project: ["read"],
  sales: ["read", "create", "update", "delete"],
})

export const purchaser = ac.newRole({
  project: ["read"],
  procurement: ["read", "create", "update", "delete"],
})

export const roles = { owner, admin, member, salesperson, purchaser }
