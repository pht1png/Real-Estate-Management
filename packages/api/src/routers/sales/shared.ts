import type { Area } from "@real-estate-management/auth/access"
import { type Permissions, roleCan } from "@real-estate-management/auth/permissions"
import type { Database } from "@real-estate-management/db"
import { contact, member } from "@real-estate-management/db/schema/index"
import { TRPCError } from "@trpc/server"
import { type AnyColumn, and, eq, sql } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import type { PgTable } from "drizzle-orm/pg-core"

import { areaProcedure } from "../../index"
import { notFound } from "../../lib/errors"

export { badRequest, conflict, notFound, uniqueViolation, withNumberRetry } from "../../lib/errors"
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

/** Next document number for the org, e.g. `RS-0036`, from the highest existing one. */
export async function nextDocumentNumber(
  db: Database,
  opts: { table: PgTable; column: AnyColumn; orgColumn: AnyColumn; orgId: string; prefix: string; width?: number },
) {
  const start = opts.prefix.length + 2
  const [row] = await db
    .select({ n: sql<number | null>`max(substring(${opts.column} from ${sql.raw(String(start))})::int)` })
    .from(opts.table)
    .where(and(eq(opts.orgColumn, opts.orgId), sql`${opts.column} ~ ${`^${opts.prefix}-[0-9]+$`}`))
  return `${opts.prefix}-${String((row?.n ?? 0) + 1).padStart(opts.width ?? 4, "0")}`
}

/** Runs several writes atomically. neon-http has no interactive transactions, but a batch is one transaction. */
export async function runBatch(db: Database, items: BatchItem<"pg">[]) {
  if (!items.length) return
  await db.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]])
}

export async function assertMember(db: Database, orgId: string, userId: string | null | undefined) {
  if (!userId) return
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1)
  if (!row) throw notFound("Team member")
}
