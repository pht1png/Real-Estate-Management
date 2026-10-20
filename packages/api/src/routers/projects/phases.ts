import { projectPhase } from "@real-estate-management/db/schema/index"
import { and, eq, max } from "drizzle-orm"
import { z } from "zod"

import { router } from "../../index"
import { badRequest, notFound } from "../../lib/errors"
import { dateInput, idInput } from "../../lib/inputs"
import { assertProject, projectProcedure } from "./shared"

const phaseFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  startDate: dateInput.nullish(),
  endDate: dateInput.nullish(),
})

function checkDates(v: z.infer<typeof phaseFields>) {
  if (v.startDate && v.endDate && v.endDate < v.startDate)
    throw badRequest("The end date must be after the start date.")
}

/** Phases, zones or buildings of a project ("Phase 1", "Building A"). Managed by admin, manager and owner. */
export const phasesRouter = router({
  create: projectProcedure("update")
    .input(phaseFields.extend({ projectId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      checkDates(input)
      await assertProject(ctx.db, ctx.orgId, input.projectId)
      const [last] = await ctx.db
        .select({ n: max(projectPhase.sortOrder) })
        .from(projectPhase)
        .where(eq(projectPhase.projectId, input.projectId))
      const [created] = await ctx.db
        .insert(projectPhase)
        .values({
          organizationId: ctx.orgId,
          projectId: input.projectId,
          name: input.name,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          sortOrder: (last?.n ?? -1) + 1,
        })
        .returning({ id: projectPhase.id })
      return created as { id: string }
    }),

  update: projectProcedure("update")
    .input(phaseFields.extend(idInput.shape))
    .mutation(async ({ ctx, input }) => {
      checkDates(input)
      const [updated] = await ctx.db
        .update(projectPhase)
        .set({ name: input.name, startDate: input.startDate ?? null, endDate: input.endDate ?? null })
        .where(and(eq(projectPhase.id, input.id), eq(projectPhase.organizationId, ctx.orgId)))
        .returning({ id: projectPhase.id })
      if (!updated) throw notFound("Phase")
      return updated
    }),

  /** Units in the phase stay; they just lose their phase. */
  delete: projectProcedure("update")
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(projectPhase)
        .where(and(eq(projectPhase.id, input.id), eq(projectPhase.organizationId, ctx.orgId)))
        .returning({ id: projectPhase.id })
      if (!deleted) throw notFound("Phase")
      return deleted
    }),
})
