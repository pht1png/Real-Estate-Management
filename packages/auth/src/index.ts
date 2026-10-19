import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2"
import type { Database } from "@real-estate-management/db"
import * as schema from "@real-estate-management/db/schema/auth"
import { betterAuth } from "better-auth"
import { openAPI, organization } from "better-auth/plugins"
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
        teams: {
          enabled: true,
        },
      }),
      openAPI(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
