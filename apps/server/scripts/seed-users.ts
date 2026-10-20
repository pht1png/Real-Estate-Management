/**
 * Seeds 20 test users (test.user01…20@example.com, password test1234) with a role and a department team,
 * so every department and every role can be tried out.
 *
 *   bun run seed:users           # adds missing users; existing members are left as they are
 *   bun run seed:users --reset   # deletes the test users first, then re-creates them
 */
import type { DepartmentCode } from "@real-estate-management/auth/access"
import { addToDepartment, ensureDepartments } from "@real-estate-management/auth/organization-defaults"
import type { RoleName } from "@real-estate-management/auth/permissions"
import { user } from "@real-estate-management/db/schema/auth"
import { like } from "drizzle-orm"

import { auth, db } from "../src/services"

const ORGANIZATION_ID = "sxtRV5ZTEjA23MamPWbc5WbUlAbXiJkQ"
const PASSWORD = "test1234"
const RESET = process.argv.includes("--reset")

const USERS: { role: RoleName; department: DepartmentCode }[] = [
  { role: "admin", department: "HR" },
  { role: "manager", department: "CON" },
  { role: "manager", department: "SM" },
  { role: "manager", department: "PUR" },
  { role: "manager", department: "ACC" },
  { role: "member", department: "SM" },
  { role: "member", department: "SM" },
  { role: "member", department: "SM" },
  { role: "member", department: "CON" },
  { role: "member", department: "CON" },
  { role: "member", department: "ENG" },
  { role: "member", department: "ENG" },
  { role: "member", department: "PUR" },
  { role: "member", department: "PUR" },
  { role: "member", department: "ACC" },
  { role: "member", department: "ACC" },
  { role: "member", department: "PM" },
  { role: "member", department: "PM" },
  { role: "member", department: "HR" },
  { role: "member", department: "MGT" },
]

if (RESET) {
  // Members, team memberships and sessions cascade; business records keep their rows (user refs set null)
  const removed = await db.delete(user).where(like(user.email, "test.user%@example.com")).returning({ id: user.id })
  console.log(`Removed ${removed.length} test users`)
}

await ensureDepartments(db, ORGANIZATION_ID)
const ctx = await auth.$context
const seen = new Map<string, number>()

for (const [i, { role, department }] of USERS.entries()) {
  const n = String(i + 1).padStart(2, "0")
  const email = `test.user${n}@example.com`
  // "SM Member 2", "CON Manager"…
  const label = `${department} ${role.charAt(0).toUpperCase()}${role.slice(1)}`
  const count = (seen.get(label) ?? 0) + 1
  seen.set(label, count)
  const name = count > 1 ? `${label} ${count}` : label

  const existing = await ctx.internalAdapter.findUserByEmail(email)
  const userId =
    existing?.user.id ?? (await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } })).user.id

  try {
    await auth.api.addMember({ body: { userId, role, organizationId: ORGANIZATION_ID } })
    await addToDepartment(db, ORGANIZATION_ID, userId, department)
    console.log(`✔ ${email} ${name} (${role}, ${department})`)
  } catch (error) {
    console.log(`- ${email}: ${error instanceof Error ? error.message : error}`)
  }
}

process.exit(0)
