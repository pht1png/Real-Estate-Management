import type { Area } from "@real-estate-management/auth/access"
import { type Permissions, roleCan } from "@real-estate-management/auth/permissions"
import type { Database } from "@real-estate-management/db"
import { contact, member } from "@real-estate-management/db/schema/index"
import { TRPCError } from "@trpc/server"
import { and, eq, sql } from "drizzle-orm"

import { areaProcedure } from "../../index"
import { notFound } from "../../lib/errors"

export { badRequest, conflict, notFound, uniqueViolation, withNumberRetry } from "../../lib/errors"
export { nextDocumentNumber, runBatch } from "../../lib/db"
export * from "../../lib/inputs"

// ─── Who can do what ────────────────────────────────────────────────────────
// Teams decide the area (Sales & Marketing, Accounting & Finance); roles decide destructive actions.

/** Area access plus a role permission, e.g. Sales & Marketing team AND a role with sales:cancel. */
const withRole = (areas: Area[], permission: Permissions, message: string) =>
  areaProcedure(...areas).use(({ ctx, next }) => {
    if (!roleCan(ctx.access.role, permission)) throw new TRPCError({ code: "FORBIDDEN", message })
    return next()
  })

/** Sales & Marketing team: read leads, contacts, reservations and contracts. */
export const readSales = areaProcedure("sales")
/** Sales & Marketing team: create and edit (including taking the reservation fee). */
export const createSales = areaProcedure("sales")
export const updateSales = createSales
/** Sales & Marketing team, manager/admin/owner role: cancel and delete. */
export const deleteSales = withRole(
  ["sales"],
  { sales: ["cancel"] },
  "Only managers can cancel or delete sales records",
)

/** Accounting & Finance team: see and record customer payments. */
export const readPayments = areaProcedure("accounting")
export const recordPayments = readPayments
/** Accounting & Finance team, manager/admin/owner role: void a payment. */
export const voidPayments = withRole(["accounting"], { payment: ["void"] }, "Only managers can void payments")

/** Lookups both teams need (form dropdowns, a contract's installments for the payment form). */
export const salesOrAccounting = areaProcedure("sales", "accounting")

// ─── Query helpers ──────────────────────────────────────────────────────────

export const contactName = sql<string>`coalesce(${contact.companyName}, concat_ws(' ', ${contact.firstName}, ${contact.lastName}))`

export async function assertMember(db: Database, orgId: string, userId: string | null | undefined) {
  if (!userId) return
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1)
  if (!row) throw notFound("Team member")
}
