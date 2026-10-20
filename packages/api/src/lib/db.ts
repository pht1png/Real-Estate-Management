import type { Database } from "@real-estate-management/db"
import { type AnyColumn, and, eq, sql } from "drizzle-orm"
import type { BatchItem } from "drizzle-orm/batch"
import type { PgTable } from "drizzle-orm/pg-core"

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
