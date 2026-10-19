import type { Auth, Session } from "@real-estate-management/auth"
import type { Database } from "@real-estate-management/db"

export type Context = {
  auth: Auth
  headers: Headers
  session: Session | null
  db: Database
}
