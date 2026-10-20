import { project, unit, unitType } from "@real-estate-management/db/schema/index"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { conflict, notFound, uniqueViolation } from "../../lib/errors"
import { idInput, optionalText } from "../../lib/inputs"
import { assertProject, optionalCount, optionalDecimal, projectProcedure } from "./shared"

const unitTypeFields = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(100),
  bedrooms: optionalCount,
  bathrooms: optionalCount,
  parkingSpaces: optionalCount,
  usableAreaSqm: optionalDecimal,
  landAreaSqw: optionalDecimal,
  basePrice: optionalDecimal,
  description: optionalText(1000),
})

const toValues = (v: z.infer<typeof unitTypeFields>) => ({
  ...v,
  bedrooms: v.bedrooms ?? null,
  bathrooms: v.bathrooms ?? null,
  parkingSpaces: v.parkingSpaces ?? null,
})

const duplicate = (code: string) => conflict(`This project already has a unit type with code ${code}.`)

/** House models / floor plans of a project. */
export const unitTypesRouter = router({
  list: projectProcedure("read")
    .input(z.object({ projectId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: unitType.id,
          projectId: unitType.projectId,
          projectName: project.name,
          code: unitType.code,
          name: unitType.name,
          bedrooms: unitType.bedrooms,
          bathrooms: unitType.bathrooms,
          parkingSpaces: unitType.parkingSpaces,
          usableAreaSqm: unitType.usableAreaSqm,
          landAreaSqw: unitType.landAreaSqw,
          basePrice: unitType.basePrice,
          description: unitType.description,
        })
        .from(unitType)
        .innerJoin(project, eq(project.id, unitType.projectId))
        .where(
          and(
            eq(unitType.organizationId, ctx.orgId),
            input.projectId ? eq(unitType.projectId, input.projectId) : undefined,
          ),
        )
        .orderBy(asc(project.name), asc(unitType.code))
      const ids = rows.map((r) => r.id)
      const counts = ids.length
        ? await ctx.db
            .select({ unitTypeId: unit.unitTypeId, n: count() })
            .from(unit)
            .where(inArray(unit.unitTypeId, ids))
            .groupBy(unit.unitTypeId)
        : []
      const byType = new Map(counts.map((c) => [c.unitTypeId, c.n]))
      return rows.map((r) => ({ ...r, unitCount: byType.get(r.id) ?? 0 }))
    }),

  create: projectProcedure("update")
    .input(unitTypeFields.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { projectId, ...fields } = input
      await assertProject(ctx.db, ctx.orgId, projectId)
      try {
        const [created] = await ctx.db
          .insert(unitType)
          .values({ ...toValues(fields), organizationId: ctx.orgId, projectId })
          .returning({ id: unitType.id })
        return created as { id: string }
      } catch (error) {
        if (uniqueViolation(error) !== null) throw duplicate(input.code)
        throw error
      }
    }),

  update: projectProcedure("update")
    .input(unitTypeFields.extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      try {
        const [updated] = await ctx.db
          .update(unitType)
          .set(toValues(fields))
          .where(and(eq(unitType.id, id), eq(unitType.organizationId, ctx.orgId)))
          .returning({ id: unitType.id })
        if (!updated) throw notFound("Unit type")
        return updated
      } catch (error) {
        if (uniqueViolation(error) !== null) throw duplicate(input.code)
        throw error
      }
    }),

  /** Owner only, and only when no unit uses the type. */
  delete: projectProcedure("delete")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const where = and(eq(unitType.id, input.id), eq(unitType.organizationId, ctx.orgId))
      const [row] = await ctx.db.select({ name: unitType.name }).from(unitType).where(where)
      if (!row) throw notFound("Unit type")
      const [used] = await ctx.db.select({ n: count() }).from(unit).where(eq(unit.unitTypeId, input.id))
      if ((used?.n ?? 0) > 0) throw conflict(`${used?.n} unit(s) use ${row.name}, so it can't be deleted.`)
      await ctx.db.delete(unitType).where(where)
      return { id: input.id }
    }),
})
