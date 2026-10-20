import {
  budgetLine,
  expense,
  lead,
  project,
  projectPhase,
  projectStatus,
  projectType,
  purchaseOrder,
  purchaseRequest,
  supplierInvoice,
  unit,
  unitType,
} from "@real-estate-management/db/schema/index"
import type { Database } from "@real-estate-management/db"
import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { conflict, notFound, uniqueViolation } from "../../lib/errors"
import {
  dateInput,
  idInput,
  listInput,
  optionalText,
  PAGE_SIZE,
  paginate,
  searchAny,
  searchTerm,
} from "../../lib/inputs"
import { optionalDecimal, projectProcedure } from "./shared"

const projectFields = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(projectType.enumValues),
  status: z.enum(projectStatus.enumValues),
  description: optionalText(2000),
  addressLine: optionalText(200),
  subdistrict: optionalText(100),
  district: optionalText(100),
  province: optionalText(100),
  postalCode: optionalText(10),
  landAreaSqw: optionalDecimal,
  launchDate: dateInput.nullish(),
  expectedCompletionDate: dateInput.nullish(),
})

/** URL slug from the name; Thai-only names fall back to the code. */
const slugify = (name: string, code: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || code.toLowerCase()

const toValues = (v: z.infer<typeof projectFields>) => ({
  ...v,
  slug: slugify(v.name, v.code),
  launchDate: v.launchDate ?? null,
  expectedCompletionDate: v.expectedCompletionDate ?? null,
})

const duplicate = (constraint: string, code: string) =>
  constraint.includes("code")
    ? conflict(`A project with code ${code} already exists.`)
    : conflict("A project with a very similar name already exists. Change the name.")

/** Units of each project by status group, for list cards and the detail header. */
async function unitSummaries(db: Database, projectIds: string[]) {
  if (!projectIds.length) return new Map<string, Record<string, number>>()
  const rows = await db
    .select({ projectId: unit.projectId, status: unit.status, n: count() })
    .from(unit)
    .where(inArray(unit.projectId, projectIds))
    .groupBy(unit.projectId, unit.status)
  const map = new Map<string, Record<string, number>>()
  for (const r of rows) map.set(r.projectId, { ...map.get(r.projectId), [r.status]: r.n })
  return map
}

const summarize = (byStatus: Record<string, number> = {}) => {
  const n = (s: string) => byStatus[s] ?? 0
  return {
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    available: n("available"),
    reserved: n("reserved"),
    sold: n("contracted") + n("transferred"),
    held: n("on_hold") + n("unavailable"),
  }
}

export const projectsRouter = router({
  /** Every project (id, code, name) for pickers and filters. */
  options: projectProcedure("read").query(({ ctx }) =>
    ctx.db
      .select({ id: project.id, code: project.code, name: project.name })
      .from(project)
      .where(eq(project.organizationId, ctx.orgId))
      .orderBy(asc(project.name)),
  ),

  list: projectProcedure("read")
    .input(
      listInput.extend({
        status: z.enum(projectStatus.enumValues).optional(),
        type: z.enum(projectType.enumValues).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = eq(project.organizationId, ctx.orgId)
      const where = and(
        scope,
        input.status ? eq(project.status, input.status) : undefined,
        input.type ? eq(project.type, input.type) : undefined,
        searchAny(searchTerm(input.search), project.name, project.code, project.province, project.district),
      )
      const { limit, offset } = paginate(input.page)
      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: project.id,
            code: project.code,
            name: project.name,
            type: project.type,
            status: project.status,
            district: project.district,
            province: project.province,
            launchDate: project.launchDate,
            expectedCompletionDate: project.expectedCompletionDate,
          })
          .from(project)
          .where(where)
          .orderBy(desc(project.createdAt), asc(project.name))
          .limit(limit)
          .offset(offset),
        ctx.db.select({ total: count() }).from(project).where(where),
        ctx.db.select({ status: project.status, count: count() }).from(project).where(scope).groupBy(project.status),
      ])
      const units = await unitSummaries(
        ctx.db,
        rows.map((r) => r.id),
      )
      return {
        rows: rows.map((r) => ({ ...r, units: summarize(units.get(r.id)) })),
        total: totals?.total ?? 0,
        pageSize: PAGE_SIZE,
        statusCounts,
      }
    }),

  get: projectProcedure("read")
    .input(idInput)
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(project)
        .where(and(eq(project.id, input.id), eq(project.organizationId, ctx.orgId)))
      if (!row) throw notFound("Project")

      const [phases, unitTypes, typeCounts, units] = await Promise.all([
        ctx.db
          .select()
          .from(projectPhase)
          .where(eq(projectPhase.projectId, input.id))
          .orderBy(asc(projectPhase.sortOrder), asc(projectPhase.name)),
        ctx.db.select().from(unitType).where(eq(unitType.projectId, input.id)).orderBy(asc(unitType.code)),
        ctx.db
          .select({ unitTypeId: unit.unitTypeId, n: count() })
          .from(unit)
          .where(eq(unit.projectId, input.id))
          .groupBy(unit.unitTypeId),
        unitSummaries(ctx.db, [input.id]),
      ])
      const countByType = new Map(typeCounts.map((t) => [t.unitTypeId, t.n]))
      return {
        ...row,
        phases,
        unitTypes: unitTypes.map((t) => ({ ...t, unitCount: countByType.get(t.id) ?? 0 })),
        units: summarize(units.get(input.id)),
      }
    }),

  create: projectProcedure("create")
    .input(projectFields)
    .mutation(async ({ ctx, input }) => {
      try {
        const [created] = await ctx.db
          .insert(project)
          .values({ ...toValues(input), organizationId: ctx.orgId })
          .returning({ id: project.id })
        return created as { id: string }
      } catch (error) {
        const constraint = uniqueViolation(error)
        if (constraint !== null) throw duplicate(constraint, input.code)
        throw error
      }
    }),

  update: projectProcedure("update")
    .input(projectFields.extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      try {
        const [updated] = await ctx.db
          .update(project)
          .set(toValues(fields))
          .where(and(eq(project.id, id), eq(project.organizationId, ctx.orgId)))
          .returning({ id: project.id })
        if (!updated) throw notFound("Project")
        return updated
      } catch (error) {
        const constraint = uniqueViolation(error)
        if (constraint !== null) throw duplicate(constraint, input.code)
        throw error
      }
    }),

  /** Owner only, and only for projects nothing refers to yet; otherwise set the status to Cancelled. */
  delete: projectProcedure("delete")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const where = and(eq(project.id, input.id), eq(project.organizationId, ctx.orgId))
      const [row] = await ctx.db.select({ name: project.name }).from(project).where(where)
      if (!row) throw notFound("Project")

      const usage = await Promise.all(
        (
          [
            ["units", unit, unit.projectId],
            ["leads", lead, lead.projectId],
            ["budget lines", budgetLine, budgetLine.projectId],
            ["purchase requests", purchaseRequest, purchaseRequest.projectId],
            ["purchase orders", purchaseOrder, purchaseOrder.projectId],
            ["expenses", expense, expense.projectId],
            ["supplier invoices", supplierInvoice, supplierInvoice.projectId],
          ] as const
        ).map(async ([label, table, column]) => {
          const [r] = await ctx.db.select({ n: count() }).from(table).where(eq(column, input.id))
          return [label, r?.n ?? 0] as const
        }),
      )
      const used = usage.filter(([, n]) => n > 0)
      if (used.length) {
        throw conflict(
          `${row.name} has ${used.map(([label, n]) => `${n} ${label}`).join(", ")}. Set its status to Cancelled instead.`,
        )
      }
      await ctx.db.delete(project).where(where)
      return { id: input.id }
    }),
})
