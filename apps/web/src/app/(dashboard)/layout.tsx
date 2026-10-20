import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import { fetchAccess } from "@/lib/access"

import { AppSidebar } from "@/components/app-sidebar"
import { PageBreadcrumbs } from "@/components/page-breadcrumbs"
import { Separator } from "@real-estate-management/ui/components/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@real-estate-management/ui/components/sidebar"

import { ModeToggle } from "@/components/mode-toggle"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const requestHeaders = await headers()
  const [session, access] = await Promise.all([
    authClient.getSession({ fetchOptions: { headers: requestHeaders, throw: true } }),
    fetchAccess(requestHeaders),
  ])

  if (!session?.user) {
    redirect("/login")
  }

  return (
    <SidebarProvider>
      <AppSidebar user={session.user} areas={access?.areas ?? []} />
      <SidebarInset>
        <header className="flex h-fit p-4 pb-0 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 mr-auto">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <PageBreadcrumbs />
          </div>
          <ModeToggle />
        </header>
        <main className="p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
