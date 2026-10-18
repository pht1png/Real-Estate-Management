// Better Auth (generated): user, session, organization, member, team...
export * from "./auth"

// Domain tables
export * from "./projects"
export * from "./inventory"
export * from "./crm"
export * from "./sales"
export * from "./budget"
export * from "./procurement"
export * from "./aftersales"
export * from "./documents"

// Only the enum is exported from shared.ts; the column helpers stay internal
// so they don't end up in `import * as schema`.
export { paymentMethod } from "./shared"
