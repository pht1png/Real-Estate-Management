import { purchaseOrder, supplier } from "@real-estate-management/db/schema/index"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { isProcurementStaff } from "../../lib/procurement-rules"
import {
  actorOf,
  assertThat,
  conflict,
  idInput,
  listInput,
  nextDocumentNumber,
  notFound,
  optionalText,
  PAGE_SIZE,
  paginate,
  procurementProcedure,
  searchAny,
  searchTerm,
  withNumberRetry,
} from "./shared"

const supplierFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  taxId: optionalText(20),
  category: optionalText(100),
  isSubcontractor: z.boolean().default(false),
  contactName: optionalText(200),
  email: z
    .email()
    .max(200)
    .nullish()
    .or(z.literal(""))
    .transform((v) => v || null),
  phone: optionalText(50),
  addressLine: optionalText(300),
  district: optionalText(100),
  province: optionalText(100),
  postalCode: optionalText(10),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  notes: optionalText(2000),
})

/** Procurement (or owner/admin) maintains the supplier list. */
const staffOnly = procurementProcedure.use(({ ctx, next }) => {
  assertThat(isProcurementStaff(actorOf(ctx)), "Only Procurement can change suppliers.")
  return next()
})

const openOrderStatuses = ["draft", "pending_approval", "approved", "sent", "partially_received"] as const

export const suppliersRouter = router({
  list: procurementProcedure
    .input(listInput.extend({ active: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(supplier.organizationId, ctx.orgId),
        input.active === undefined ? undefined : eq(supplier.isActive, input.active),
        searchAny(searchTerm(input.search), supplier.name, supplier.code, supplier.category, supplier.taxId),
      )
      const { limit, offset } = paginate(input.page)
      const [rows, [totals]] = await Promise.all([
        ctx.db.select().from(supplier).where(where).orderBy(asc(supplier.name)).limit(limit).offset(offset),
        ctx.db.select({ total: count() }).from(supplier).where(where),
      ])

      const ids = rows.map((r) => r.id)
      const openOrders = ids.length
        ? await ctx.db
            .select({ supplierId: purchaseOrder.supplierId, count: count() })
            .from(purchaseOrder)
            .where(and(inArray(purchaseOrder.supplierId, ids), inArray(purchaseOrder.status, [...openOrderStatuses])))
            .groupBy(purchaseOrder.supplierId)
        : []
      const openBy = new Map(openOrders.map((o) => [o.supplierId, o.count]))

      return {
        rows: rows.map((r) => ({ ...r, openOrders: openBy.get(r.id) ?? 0 })),
        total: totals?.total ?? 0,
        pageSize: PAGE_SIZE,
      }
    }),

  create: staffOnly.input(supplierFields).mutation(async ({ ctx, input }) =>
    withNumberRetry(
      async () => {
        const code = await nextDocumentNumber(ctx.db, {
          table: supplier,
          column: supplier.code,
          orgColumn: supplier.organizationId,
          orgId: ctx.orgId,
          prefix: "SUP",
          width: 3,
        })
        const [row] = await ctx.db
          .insert(supplier)
          .values({ ...input, organizationId: ctx.orgId, code })
          .returning({ id: supplier.id, code: supplier.code })
        return row as { id: string; code: string }
      },
      () => conflict("Couldn't allocate a supplier code. Try again."),
    ),
  ),

  update: staffOnly.input(idInput.extend(supplierFields.shape)).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input
    const [row] = await ctx.db
      .update(supplier)
      .set(values)
      .where(and(eq(supplier.id, id), eq(supplier.organizationId, ctx.orgId)))
      .returning({ id: supplier.id })
    if (!row) throw notFound("Supplier")
    return row
  }),

  /** Inactive suppliers keep their history but can't get new purchase orders. */
  setActive: staffOnly.input(idInput.extend({ active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .update(supplier)
      .set({ isActive: input.active })
      .where(and(eq(supplier.id, input.id), eq(supplier.organizationId, ctx.orgId)))
      .returning({ id: supplier.id })
    if (!row) throw notFound("Supplier")
    return row
  }),
})
