import { type NextRequest, NextResponse } from "next/server"

import { authClient } from "@/lib/auth-client"
import { canAccess, getRoutePermission } from "@/lib/navigation"

export async function proxy(request: NextRequest) {
  const permission = getRoutePermission(request.nextUrl.pathname)
  if (!permission) return NextResponse.next()

  const { data } = await authClient.organization.getActiveMemberRole({
    fetchOptions: { headers: request.headers },
  })

  if (!canAccess(data?.role, permission)) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Skip Next internals and static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
