import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@real-estate-management/ui/components/empty"
import type { Route } from "next"
import { notFound, redirect } from "next/navigation"

import { getPageTitle, getRouteTab } from "@/lib/navigation"

/**
 * Sidebar URLs without a page of their own:
 * - a tab's URL (/sales-marketing) opens the tab's first page
 * - a page that isn't built yet shows a placeholder
 * Anything not in the sidebar is a normal 404.
 */
export default async function NotBuiltYet({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const pathname = `/${slug.join("/")}`
  const tab = getRouteTab(pathname)
  if (!tab) notFound()

  const firstPage = tab.items[0]?.url.pathname
  if (pathname === tab.url && firstPage) redirect(firstPage as Route)

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
