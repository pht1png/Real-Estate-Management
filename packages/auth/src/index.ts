import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@real-estate-management/db"
import * as schema from "@real-estate-management/db/schema/auth"
import { betterAuth } from "better-auth"
import { openAPI, organization } from "better-auth/plugins"
import { team } from "@real-estate-management/db/schema/auth"

import { departmentTeamValues, ensureDepartments } from "./organization-defaults"
import { ac, roles } from "./permissions"

export type AuthConfig = {
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  CORS_ORIGIN: string
}

export function createAuth(env: AuthConfig, database: Database, desktopOrigins: readonly string[] = []) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [
      organization({
        ac,
        roles,
        // Teams are the departments; `code` (MGT, SM, CON…) is what access rules match on, set by us only
        schema: {
          team: {
            additionalFields: {
              code: { type: "string", required: false, input: false },
            },
          },
        },
        teams: {
          enabled: true,
          // The org's default team is Executive & Management; Better Auth puts the creator (owner) in it
          defaultTeam: {
            enabled: true,
            customCreateDefaultTeam: async (org) => {
              const [mgt] = await database.insert(team).values(departmentTeamValues(org.id, "MGT")).returning()
              if (!mgt) throw new Error("Could not create the MGT department")
              return { ...mgt, updatedAt: mgt.updatedAt ?? undefined }
            },
          },
        },
        organizationHooks: {
          // The other 7 department teams
          afterCreateOrganization: async ({ organization }) => {
            await ensureDepartments(database, organization.id)
          },
        },
      }),
      openAPI(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
