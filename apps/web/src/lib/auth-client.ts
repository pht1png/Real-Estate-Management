import { ac, roles } from "@real-estate-management/auth/permissions"
import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL!,
  plugins: [organizationClient({ ac, roles })],
})

export type Session = typeof authClient.$Infer.Session
export type User = Session["user"]
export type ActiveOrganizationId = Session["session"]["activeOrganizationId"]
export type Organization = typeof authClient.$Infer.Organization
export type Member = typeof authClient.$Infer.Member
export type Team = typeof authClient.$Infer.Team
export type Invitation = typeof authClient.$Infer.Invitation
