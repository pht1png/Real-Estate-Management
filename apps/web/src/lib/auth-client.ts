import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL!,
  plugins: [organizationClient()],
})

export type Session = typeof authClient.$Infer.Session
export type User = Session["user"]
