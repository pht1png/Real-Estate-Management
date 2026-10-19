import { auth } from "../src/services"

const ORGANIZATION_ID = "sxtRV5ZTEjA23MamPWbc5WbUlAbXiJkQ"
const TEAM_ID = "mwF7kYC4g8bIZmjS35Hgvpslgd9jGY56"
const PASSWORD = "test1234"
const USER_COUNT = 20
const ROLES = ["member", "salesperson", "purchaser"] as const

const ctx = await auth.$context

for (let i = 1; i <= USER_COUNT; i++) {
  const n = String(i).padStart(2, "0")
  const email = `test.user${n}@example.com`
  const role = ROLES[(i - 1) % ROLES.length] as (typeof ROLES)[number]

  // Re-runnable: reuse the user if it already exists
  const existing = await ctx.internalAdapter.findUserByEmail(email)
  const userId =
    existing?.user.id ??
    (await auth.api.signUpEmail({ body: { name: `Test User ${n}`, email, password: PASSWORD } })).user.id

  try {
    await auth.api.addMember({
      body: { userId, role, organizationId: ORGANIZATION_ID, teamId: TEAM_ID },
    })
    console.log(`✔ ${email} (${role})`)
  } catch (error) {
    console.log(`- ${email}: ${error instanceof Error ? error.message : error}`)
  }
}

process.exit(0)
