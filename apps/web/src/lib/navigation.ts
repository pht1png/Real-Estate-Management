import type { Permissions, roles } from "@real-estate-management/auth/permissions"
import {
  Building2Icon,
  HandshakeIcon,
  type LucideIcon,
  Settings2Icon,
  ShoppingCartIcon,
  WrenchIcon,
} from "lucide-react"
import type { UrlObject } from "node:url"

import { authClient } from "@/lib/auth-client"

export type NavItem = {
  title: string
  url: string
  icon: LucideIcon
  isActive?: boolean
  // Required to see this section and visit any of its pages
  permission?: Permissions
  items: { title: string; url: UrlObject }[]
}

export const navMain: NavItem[] = [
  {
    title: "Projects",
    url: "/projects",
    icon: Building2Icon,
    isActive: true,
    permission: { project: ["read"] },
    items: [
      { title: "All projects", url: { pathname: "/projects" } },
      { title: "Units", url: { pathname: "/units" } },
      { title: "Unit types", url: { pathname: "/unit-types" } },
    ],
  },
  {
    title: "Sales",
    url: "/sales",
    icon: HandshakeIcon,
    permission: { sales: ["read"] },
    items: [
      { title: "Leads", url: { pathname: "/sales/leads" } },
      { title: "Contacts", url: { pathname: "/sales/contacts" } },
      { title: "Reservations", url: { pathname: "/sales/reservations" } },
      { title: "Contracts", url: { pathname: "/sales/contracts" } },
      { title: "Payments", url: { pathname: "/sales/payments" } },
    ],
  },
  {
    title: "Procurement",
    url: "/procurement",
    icon: ShoppingCartIcon,
    permission: { procurement: ["read"] },
    items: [
      { title: "Purchase requests", url: { pathname: "/procurement/requests" } },
      { title: "Purchase orders", url: { pathname: "/procurement/orders" } },
      { title: "Goods receipts", url: { pathname: "/procurement/receipts" } },
      { title: "Suppliers", url: { pathname: "/procurement/suppliers" } },
      { title: "Supplier invoices", url: { pathname: "/procurement/invoices" } },
    ],
  },
  {
    title: "After-sales",
    url: "/aftersales",
    icon: WrenchIcon,
    permission: { aftersales: ["read"] },
    items: [
      { title: "Handovers", url: { pathname: "/aftersales/handovers" } },
      { title: "Defects", url: { pathname: "/aftersales/defects" } },
    ],
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings2Icon,
    permission: { organization: ["update"] },
    items: [
      { title: "Organization", url: { pathname: "/settings/organizations" } },
      { title: "Members", url: { pathname: "/settings/members" } },
    ],
  },
]

export function canAccess(role: string | null | undefined, permission: Permissions | undefined) {
  if (!permission) return true
  if (!role) return false
  // A member can hold several comma-separated roles ("admin,salesperson"); Better Auth splits them at runtime
  return authClient.organization.checkRolePermission({ role: role as keyof typeof roles, permissions: permission })
}

export function getNavForRole(role: string | null | undefined) {
  return navMain.filter((item) => canAccess(role, item.permission))
}

// Every URL a section owns (its own plus its sub-items), mapped to the section's permission
const routePermissions = navMain
  .flatMap((item) => [item.url, ...item.items.map((sub) => sub.url.pathname ?? "")].map((url) => ({ url, item })))
  .filter(({ url }) => url)
  .sort((a, b) => b.url.length - a.url.length)

// Permission required for a pathname, matched by the longest URL prefix
export function getRoutePermission(pathname: string) {
  return routePermissions.find(({ url }) => pathname === url || pathname.startsWith(`${url}/`))?.item.permission
}
