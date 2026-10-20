import { type NextRequest, NextResponse } from "next/server"

import { fetchAccess } from "@/lib/access"
import { getRouteTab } from "@/lib/navigation"

/** Sends people away from tabs their department teams don't unlock. */
export async function proxy(request: NextRequest) {
  const tab = getRouteTab(request.nextUrl.pathname)
  if (!tab) return NextResponse.next()

  const access = await fetchAccess(request.headers)
  if (!access?.areas.includes(tab.area)) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Skip Next internals and static files
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
