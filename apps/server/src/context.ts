import type { Context as ApiContext } from "@real-estate-management/api/context"
import type { Context as HonoContext } from "hono"

import { db } from "./services"
import { auth } from "./services"

export type CreateContextOptions = {
  context: HonoContext
}

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const headers = context.req.raw.headers
  const session = await auth.api.getSession({ headers })
  return {
    auth,
    headers,
    db,
    session,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
