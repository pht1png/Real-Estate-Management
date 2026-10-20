import { Card, CardDescription, CardHeader, CardTitle } from "@real-estate-management/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@real-estate-management/ui/components/empty"
import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/list/list-layout"
import { getPageTitle, getRouteTab, type NavItem } from "@/lib/navigation"

/** A tab's own URL (/accounting-finance): the tab's pages to choose from. Breadcrumbs link here. */
function TabOverview({ tab }: { tab: NavItem }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={tab.title} description={`Everything in ${tab.title}.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tab.items.map((item) => (
          <Link key={item.title} href={item.url} className="group">
            <Card size="sm" className="transition-colors group-hover:bg-muted/50">
              <CardHeader className="grid-cols-[1fr_auto] items-center">
                <CardTitle>{item.title}</CardTitle>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
                <CardDescription>{item.url.pathname}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * Sidebar URLs without a page of their own:
 * - a tab's URL shows the tab's pages
 * - a page that isn't built yet shows a placeholder
 * Anything not in the sidebar is a normal 404.
 */
export default async function SidebarFallbackPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const pathname = `/${slug.join("/")}`
  const tab = getRouteTab(pathname)
  if (!tab) notFound()
  if (pathname === tab.url) return <TabOverview tab={tab} />

  const title = getPageTitle(pathname)
  if (!title) notFound()

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>
          This {tab.title} page isn&apos;t built yet. It&apos;s in the sidebar so the department can see what&apos;s
          coming.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
