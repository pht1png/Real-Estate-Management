import type { Database } from "@real-estate-management/db"
import {
  defectTicket,
  project,
  projectPhase,
  reservation,
  salesContract,
  unit,
  unitStatus,
  unitType,
} from "@real-estate-management/db/schema/index"
import { and, asc, count, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { badRequest, conflict, notFound, uniqueViolation } from "../../lib/errors"
import {
  idInput,
  listInput,
  moneyInput,
  optionalText,
  PAGE_SIZE,
  paginate,
  searchAny,
  searchTerm,
  toMoney,
} from "../../lib/inputs"
import { canChangeUnitStatus, generateUnitNumbers, manualUnitStatuses } from "../../lib/units"
import { assertProject, optionalDecimal, projectProcedure } from "./shared"

const unitFields = z.object({
  phaseId: z.string().nullish(),
  unitTypeId: z.string().nullish(),
  unitNumber: z.string().trim().min(1, "Unit number is required").max(30),
  houseNumber: optionalText(30),
  floor: z.number().int().min(-5).max(200).nullish(),
  facing: optionalText(50),
  usableAreaSqm: optionalDecimal,
  landAreaSqw: optionalDecimal,
  listPrice: moneyInput,
  titleDeedNumber: optionalText(50),
  notes: optionalText(1000),
})

const patternInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("floors"),
    prefix: z.string().max(20),
    floorFrom: z.number().int(),
    floorTo: z.number().int(),
    roomsPerFloor: z.number().int(),
  }),
  z.object({
    kind: z.literal("sequence"),
    prefix: z.string().max(20),
    from: z.number().int(),
    to: z.number().int(),
    pad: z.number().int(),
  }),
])

/** Phase and unit type must belong to the unit's project. Returns the unit type (for defaults). */
async function checkRefs(db: Database, projectId: string, phaseId?: string | null, unitTypeId?: string | null) {
  const [[phase], [type]] = await Promise.all([
    phaseId
      ? db
          .select({ id: projectPhase.id })
          .from(projectPhase)
          .where(and(eq(projectPhase.id, phaseId), eq(projectPhase.projectId, projectId)))
      : Promise.resolve([{ id: null }]),
    unitTypeId
      ? db
          .select({
            basePrice: unitType.basePrice,
            usableAreaSqm: unitType.usableAreaSqm,
            landAreaSqw: unitType.landAreaSqw,
          })
          .from(unitType)
          .where(and(eq(unitType.id, unitTypeId), eq(unitType.projectId, projectId)))
      : Promise.resolve([null]),
  ])
  if (phaseId && !phase) throw notFound("Phase in this project")
  if (unitTypeId && !type) throw notFound("Unit type in this project")
  return type ?? null
}

const duplicateNumber = (unitNumber: string) => conflict(`Unit ${unitNumber} already exists in this project.`)

export const unitsRouter = router({
  list: projectProcedure("read")
    .input(
      listInput.extend({
        projectId: z.string().optional(),
        unitTypeId: z.string().optional(),
        status: z.enum(unitStatus.enumValues).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const scope = and(
        eq(unit.organizationId, ctx.orgId),
        input.projectId ? eq(unit.projectId, input.projectId) : undefined,
      )
      const where = and(
        scope,
        input.unitTypeId ? eq(unit.unitTypeId, input.unitTypeId) : undefined,
        input.status ? eq(unit.status, input.status) : undefined,
        searchAny(searchTerm(input.search), unit.unitNumber, unit.houseNumber, unit.titleDeedNumber),
      )
      const { limit, offset } = paginate(input.page)
      const [rows, [totals], statusCounts] = await Promise.all([
        ctx.db
          .select({
            id: unit.id,
            projectId: unit.projectId,
            projectName: project.name,
            phaseId: unit.phaseId,
            phaseName: projectPhase.name,
            unitTypeId: unit.unitTypeId,
            unitTypeName: unitType.name,
            unitNumber: unit.unitNumber,
            houseNumber: unit.houseNumber,
            floor: unit.floor,
            facing: unit.facing,
            usableAreaSqm: unit.usableAreaSqm,
            landAreaSqw: unit.landAreaSqw,
            listPrice: unit.listPrice,
            status: unit.status,
            titleDeedNumber: unit.titleDeedNumber,
            notes: unit.notes,
          })
          .from(unit)
          .innerJoin(project, eq(project.id, unit.projectId))
          .leftJoin(projectPhase, eq(projectPhase.id, unit.phaseId))
          .leftJoin(unitType, eq(unitType.id, unit.unitTypeId))
          .where(where)
          .orderBy(asc(project.name), asc(unit.unitNumber))
          .limit(limit)
          .offset(offset),
        ctx.db.select({ total: count() }).from(unit).where(where),
        ctx.db.select({ status: unit.status, count: count() }).from(unit).where(scope).groupBy(unit.status),
      ])
      return { rows, total: totals?.total ?? 0, pageSize: PAGE_SIZE, statusCounts }
    }),

  create: projectProcedure("update")
    .input(unitFields.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.orgId, input.projectId)
      await checkRefs(ctx.db, input.projectId, input.phaseId, input.unitTypeId)
      try {
        const [created] = await ctx.db
          .insert(unit)
          .values({
            ...input,
            organizationId: ctx.orgId,
            phaseId: input.phaseId || null,
            unitTypeId: input.unitTypeId || null,
            floor: input.floor ?? null,
            listPrice: toMoney(input.listPrice),
            status: "available",
          })
          .returning({ id: unit.id })
        return created as { id: string }
      } catch (error) {
        if (uniqueViolation(error) !== null) throw duplicateNumber(input.unitNumber)
        throw error
      }
    }),

  /**
   * Creates many units from a numbering pattern. Price and areas default to the unit type's.
   * All or nothing: any clash with an existing unit number is reported and nothing is created.
   */
  bulkCreate: projectProcedure("update")
    .input(
      z.object({
        projectId: z.string().min(1),
        phaseId: z.string().nullish(),
        unitTypeId: z.string().nullish(),
        pattern: patternInput,
        listPrice: moneyInput.nullish(),
        facing: optionalText(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertProject(ctx.db, ctx.orgId, input.projectId)
      const type = await checkRefs(ctx.db, input.projectId, input.phaseId, input.unitTypeId)
      const generated = generateUnitNumbers(input.pattern)
      if (generated.error) throw badRequest(generated.error)

      const listPrice = input.listPrice ?? (type?.basePrice ? Number(type.basePrice) : null)
      if (listPrice == null) throw badRequest("Enter a list price, or pick a unit type that has a base price.")

      const numbers = generated.units.map((u) => u.unitNumber)
      const clashes = await ctx.db
        .select({ unitNumber: unit.unitNumber })
        .from(unit)
        .where(and(eq(unit.projectId, input.projectId), inArray(unit.unitNumber, numbers)))
      if (clashes.length) {
        const shown = clashes
          .map((c) => c.unitNumber)
          .sort()
          .slice(0, 10)
        throw conflict(
          `${clashes.length} of these units already exist: ${shown.join(", ")}${clashes.length > shown.length ? "…" : ""}`,
        )
      }

      try {
        await ctx.db.insert(unit).values(
          generated.units.map((u) => ({
            organizationId: ctx.orgId,
            projectId: input.projectId,
            phaseId: input.phaseId || null,
            unitTypeId: input.unitTypeId || null,
            unitNumber: u.unitNumber,
            floor: u.floor,
            facing: input.facing,
            usableAreaSqm: type?.usableAreaSqm ?? null,
            landAreaSqw: type?.landAreaSqw ?? null,
            listPrice: toMoney(listPrice),
            status: "available" as const,
          })),
        )
      } catch (error) {
        if (uniqueViolation(error) !== null) throw conflict("Some of these units were just created by someone else.")
        throw error
      }
      return { created: generated.units.length }
    }),

  /** Everything except status (see setStatus) and project. */
  update: projectProcedure("update")
    .input(unitFields.extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input
      const [existing] = await ctx.db
        .select({ projectId: unit.projectId })
        .from(unit)
        .where(and(eq(unit.id, id), eq(unit.organizationId, ctx.orgId)))
      if (!existing) throw notFound("Unit")
      await checkRefs(ctx.db, existing.projectId, fields.phaseId, fields.unitTypeId)
      try {
        await ctx.db
          .update(unit)
          .set({
            ...fields,
            phaseId: fields.phaseId || null,
            unitTypeId: fields.unitTypeId || null,
            floor: fields.floor ?? null,
            listPrice: toMoney(fields.listPrice),
          })
          .where(eq(unit.id, id))
      } catch (error) {
        if (uniqueViolation(error) !== null) throw duplicateNumber(input.unitNumber)
        throw error
      }
      return { id }
    }),

  /** Only between available, on hold and unavailable; sales statuses come from the sales workflow. */
  setStatus: projectProcedure("update")
    .input(idInput.extend({ status: z.enum(manualUnitStatuses) }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ status: unit.status, unitNumber: unit.unitNumber })
        .from(unit)
        .where(and(eq(unit.id, input.id), eq(unit.organizationId, ctx.orgId)))
      if (!existing) throw notFound("Unit")
      if (!canChangeUnitStatus(existing.status, input.status)) {
        throw badRequest(
          `Unit ${existing.unitNumber} is ${existing.status.replace("_", " ")}; that's managed by sales, not here.`,
        )
      }
      // Guarded on the old status, so a sale that happened meanwhile isn't overwritten
      const [updated] = await ctx.db
        .update(unit)
        .set({ status: input.status })
        .where(and(eq(unit.id, input.id), eq(unit.status, existing.status)))
        .returning({ id: unit.id })
      if (!updated) throw conflict("This unit's status just changed. Reload and try again.")
      return updated
    }),

  /** Owner only, and only for units with no reservations, contracts or defects. */
  delete: projectProcedure("delete")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const where = and(eq(unit.id, input.id), eq(unit.organizationId, ctx.orgId))
      const [row] = await ctx.db.select({ unitNumber: unit.unitNumber }).from(unit).where(where)
      if (!row) throw notFound("Unit")
      const [[r], [c], [d]] = await Promise.all([
        ctx.db.select({ n: count() }).from(reservation).where(eq(reservation.unitId, input.id)),
        ctx.db.select({ n: count() }).from(salesContract).where(eq(salesContract.unitId, input.id)),
        ctx.db.select({ n: count() }).from(defectTicket).where(eq(defectTicket.unitId, input.id)),
      ])
      if ((r?.n ?? 0) + (c?.n ?? 0) + (d?.n ?? 0) > 0) {
        throw conflict(`Unit ${row.unitNumber} has sales or defect records. Set it to Unavailable instead.`)
      }
      await ctx.db.delete(unit).where(where)
      return { id: input.id }
    }),
})
