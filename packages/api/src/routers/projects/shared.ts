import { roleCan } from "@real-estate-management/auth/permissions"
import type { Database } from "@real-estate-management/db"
import { project } from "@real-estate-management/db/schema/index"
import { TRPCError } from "@trpc/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { areaProcedure } from "../../index"
import { notFound } from "../../lib/errors"

type ProjectAction = "read" | "create" | "update" | "delete"

const actionVerb: Record<ProjectAction, string> = {
  read: "view",
  create: "create",
  update: "change",
  delete: "delete",
}

/**
 * Projects are open to everyone in the org (Projects area); what you can do depends on your role:
 * everyone reads, admin/manager update, the owner creates and deletes.
 */
export const projectProcedure = (action: ProjectAction) =>
  areaProcedure("projects").use(({ ctx, next }) => {
    if (!roleCan(ctx.access.role, { project: [action] })) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Your role can't ${actionVerb[action]} projects` })
    }
    return next()
  })

/** Throws NOT_FOUND unless the project belongs to the org. */
export async function assertProject(db: Database, orgId: string, projectId: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.organizationId, orgId)))
  if (!row) throw notFound("Project")
}

/** Optional number input that becomes a numeric-column string (or null). */
export const optionalDecimal = z
  .number()
  .min(0)
  .max(1_000_000_000)
  .nullish()
  .transform((v) => (v == null ? null : v.toFixed(2)))

export const optionalCount = z.number().int().min(0).max(99).nullish()
