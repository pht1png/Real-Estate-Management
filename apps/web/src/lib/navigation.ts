import type { Area } from "@real-estate-management/auth/access"
import {
  BriefcaseIcon,
  Building2Icon,
  DraftingCompassIcon,
  HandshakeIcon,
  HardHatIcon,
  KeyRoundIcon,
  type LucideIcon,
  ShoppingCartIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react"
import type { UrlObject } from "node:url"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  /** The area of the app this tab belongs to; department teams unlock areas (see packages/auth/src/access.ts). */
  area: Area
  items: {
    title: string
    url: UrlObject
    /** Only for people who can approve purchases; shows how many are waiting on them. */
    approvals?: true
  }[]
}

// One tab per department (title = department name, URL = its slug), plus Projects for everyone.
// Every page lives under its tab's URL.
export const navMain: NavItem[] = [
  {
    title: "Executive & Management",
    url: "/executive-management",
    icon: BriefcaseIcon,
    area: "executive",
    items: [
      { title: "Overview", url: { pathname: "/executive-management/overview" } },
      { title: "Reports", url: { pathname: "/executive-management/reports" } },
    ],
  },
  {
    title: "Projects",
    url: "/projects",
    icon: Building2Icon,
    isActive: true,
    area: "projects",
    items: [
      { title: "All projects", url: { pathname: "/projects/all" } },
      { title: "Units", url: { pathname: "/projects/units" } },
      { title: "Unit types", url: { pathname: "/projects/unit-types" } },
    ],
  },
  {
    title: "Project & Construction",
    url: "/project-construction",
    icon: HardHatIcon,
    area: "construction",
    items: [
      { title: "Site progress", url: { pathname: "/project-construction/progress" } },
      { title: "Budget", url: { pathname: "/project-construction/budget" } },
      { title: "Inspections", url: { pathname: "/project-construction/inspections" } },
    ],
  },
  {
    title: "Engineering & Design",
    url: "/engineering-design",
    icon: DraftingCompassIcon,
    area: "engineering",
    items: [
      { title: "Drawings", url: { pathname: "/engineering-design/drawings" } },
      { title: "Specifications", url: { pathname: "/engineering-design/specifications" } },
      { title: "Change requests", url: { pathname: "/engineering-design/change-requests" } },
    ],
  },
  {
    title: "Sales & Marketing",
    url: "/sales-marketing",
    icon: HandshakeIcon,
    area: "sales",
    items: [
      { title: "Leads", url: { pathname: "/sales-marketing/leads" } },
      { title: "Contacts", url: { pathname: "/sales-marketing/contacts" } },
      { title: "Reservations", url: { pathname: "/sales-marketing/reservations" } },
      { title: "Contracts", url: { pathname: "/sales-marketing/contracts" } },
      { title: "Campaigns", url: { pathname: "/sales-marketing/campaigns" } },
    ],
  },
  {
    title: "Procurement",
    url: "/procurement",
    icon: ShoppingCartIcon,
    area: "procurement",
    items: [
      { title: "Purchase requests", url: { pathname: "/procurement/purchase-requests" } },
      { title: "Purchase orders", url: { pathname: "/procurement/purchase-orders" } },
      { title: "Goods receipts", url: { pathname: "/procurement/goods-receipts" } },
      { title: "Suppliers", url: { pathname: "/procurement/suppliers" } },
      { title: "Approvals", url: { pathname: "/procurement/approvals" }, approvals: true },
    ],
  },
  {
    title: "Accounting & Finance",
    url: "/accounting-finance",
    icon: WalletIcon,
    area: "accounting",
    items: [
      { title: "Customer payments", url: { pathname: "/accounting-finance/customer-payments" } },
      { title: "Installments due", url: { pathname: "/accounting-finance/installments-due" } },
      { title: "Supplier invoices", url: { pathname: "/accounting-finance/supplier-invoices" } },
      { title: "Supplier payments", url: { pathname: "/accounting-finance/supplier-payments" } },
      { title: "Expenses", url: { pathname: "/accounting-finance/expenses" } },
    ],
  },
  {
    title: "Property Management",
    url: "/property-management",
    icon: KeyRoundIcon,
    area: "property",
    items: [
      { title: "Handovers", url: { pathname: "/property-management/handovers" } },
      { title: "Defects", url: { pathname: "/property-management/defects" } },
      { title: "Common fees", url: { pathname: "/property-management/common-fees" } },
    ],
  },
  {
    title: "HR & Admin",
    url: "/hr-admin",
    icon: UsersIcon,
    area: "admin",
    items: [
      { title: "Members", url: { pathname: "/hr-admin/members" } },
      { title: "Departments", url: { pathname: "/hr-admin/departments" } },
      { title: "Organizations", url: { pathname: "/hr-admin/organizations" } },
    ],
  },
]

/** Tabs for the areas this member can use. */
export function getNavForAreas(areas: readonly Area[]) {
  return navMain.filter((item) => areas.includes(item.area))
}

// Every URL a tab owns (its own plus its pages), mapped to the tab
const routeTabs = navMain
  .flatMap((item) => [item.url, ...item.items.map((sub) => sub.url.pathname ?? "")].map((url) => ({ url, item })))
  .filter(({ url }) => url)
  .sort((a, b) => b.url.length - a.url.length)

/** The tab a pathname belongs to, matched by the longest URL prefix. */
export function getRouteTab(pathname: string) {
  return routeTabs.find(({ url }) => pathname === url || pathname.startsWith(`${url}/`))?.item
}

/** The page title for a pathname from the navigation, e.g. "Supplier invoices". */
export function getPageTitle(pathname: string) {
  return navMain.flatMap((item) => item.items).find((sub) => sub.url.pathname === pathname)?.title
}

export type Crumb = { label: string; href: string }

/** "unit-types" → "Unit types". IDs and document numbers ("PO-0042", UUIDs) are shown as they are. */
const humanize = (segment: string) => {
  const text = decodeURIComponent(segment)
  if (!/^[a-z][a-z-_]*$/.test(text)) return text
  const words = text.replace(/[-_]+/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A tab's crumb links to the tab's overview page (its URL), which lists the tab's pages. */
const tabHref = (tab: NavItem) => tab.url

/**
 * Breadcrumbs for a pathname, named like the sidebar: /sales/leads → Sales & Marketing › Leads.
 * Pages whose URL sits outside their tab's (e.g. /units in Projects) get the tab prepended.
 */
export function getBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  const tab = getRouteTab(pathname)
  const crumbs: Crumb[] = []

  if (tab && pathname !== tab.url && !pathname.startsWith(`${tab.url}/`)) {
    crumbs.push({ label: tab.title, href: tabHref(tab) })
  }

  segments.forEach((segment, i) => {
    const path = `/${segments.slice(0, i + 1).join("/")}`
    const tabAtPath = navMain.find((item) => item.url === path)
    crumbs.push({
      label: tabAtPath?.title ?? getPageTitle(path) ?? humanize(segment),
      href: tabAtPath ? tabHref(tabAtPath) : path,
    })
  })

  return crumbs
}
