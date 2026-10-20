import type { AppRouter } from "@real-estate-management/api/routers/index"
import type { inferRouterOutputs } from "@trpc/server"

export type MemberAccess = inferRouterOutputs<AppRouter>["access"]["me"]

/**
 * The current member's role, department teams and unlocked areas, asked from the API with the request's
 * cookies. Used on the server (dashboard layout, proxy); null when signed out or no organization is active.
 */
export async function fetchAccess(requestHeaders: Headers): Promise<MemberAccess | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "")}/trpc/access.me`, {
      headers: { cookie: requestHeaders.get("cookie") ?? "" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const body = (await res.json()) as { result?: { data?: MemberAccess } }
    return body.result?.data ?? null
  } catch {
    return null
  }
}
