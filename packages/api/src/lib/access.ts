import { type Access, type DepartmentCode, isDepartmentCode } from "@real-estate-management/auth/access"
import type { Database } from "@real-estate-management/db"
import { member, team, teamMember } from "@real-estate-management/db/schema/auth"
import { and, eq, isNotNull } from "drizzle-orm"

/** The member's role and the department teams they're in, for the active organization. */
export async function loadAccess(db: Database, orgId: string, userId: string): Promise<Access> {
  const [[m], teams] = await Promise.all([
    db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, userId))),
    db
      .select({ code: team.code })
      .from(teamMember)
      .innerJoin(team, eq(team.id, teamMember.teamId))
      .where(and(eq(teamMember.userId, userId), eq(team.organizationId, orgId), isNotNull(team.code))),
  ])
  return {
    role: m?.role ?? null,
    departments: teams.flatMap((t) => (isDepartmentCode(t.code) ? [t.code as DepartmentCode] : [])),
  }
}
