/**
 * Server-only setup for department teams: creating the 8 departments for an org and putting people in them.
 * Idempotent, so the org-creation hook, the backfill script and the seeds share it. Not imported by the web app.
 */
import { createHash } from "node:crypto"

import type { Database } from "@real-estate-management/db"
import { team, teamMember } from "@real-estate-management/db/schema/auth"
import { and, count, eq, isNotNull } from "drizzle-orm"

import { type DepartmentCode, departments } from "./access"

/** Better Auth's teamMember.membershipKey: base64url(SHA-256(JSON [teamId, userId])), unpadded. */
const teamMembershipKey = (teamId: string, userId: string) =>
  createHash("sha256")
    .update(JSON.stringify([teamId, userId]))
    .digest("base64url")

export function departmentTeamValues(organizationId: string, code: DepartmentCode) {
  const dept = departments.find((d) => d.code === code) as (typeof departments)[number]
  return { id: crypto.randomUUID(), organizationId, name: dept.name, code, createdAt: new Date() }
}

/** Department code → team id for an org. */
export async function departmentTeams(db: Database, organizationId: string) {
  const rows = await db
    .select({ id: team.id, code: team.code })
    .from(team)
    .where(and(eq(team.organizationId, organizationId), isNotNull(team.code)))
  return new Map(rows.map((r) => [r.code as DepartmentCode, r.id]))
}

/** Creates any department team the org is missing. */
export async function ensureDepartments(db: Database, organizationId: string) {
  const existing = await departmentTeams(db, organizationId)
  const missing = departments.filter((d) => !existing.has(d.code))
  if (missing.length) await db.insert(team).values(missing.map((d) => departmentTeamValues(organizationId, d.code)))
  return departmentTeams(db, organizationId)
}

/** Puts a user in a department team (no-op if already there) and keeps Better Auth's member count right. */
export async function addToDepartment(db: Database, organizationId: string, userId: string, code: DepartmentCode) {
  const teamId = (await departmentTeams(db, organizationId)).get(code)
  if (!teamId) throw new Error(`Department ${code} doesn't exist in this organization`)
  await db
    .insert(teamMember)
    .values({
      id: crypto.randomUUID(),
      teamId,
      userId,
      membershipKey: teamMembershipKey(teamId, userId),
      createdAt: new Date(),
    })
    .onConflictDoNothing()
  const [row] = await db.select({ n: count() }).from(teamMember).where(eq(teamMember.teamId, teamId))
  await db
    .update(team)
    .set({ memberCount: row?.n ?? 0 })
    .where(eq(team.id, teamId))
}
