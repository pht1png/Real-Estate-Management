import { Badge } from "@real-estate-management/ui/components/badge"

import { labelize } from "@/lib/format"

type Variant = "default" | "secondary" | "outline" | "destructive"

const variants: Record<string, Variant> = {
  // leads
  new: "outline",
  contacted: "secondary",
  visited: "secondary",
  negotiating: "default",
  won: "default",
  lost: "destructive",
  // reservations
  active: "default",
  converted: "secondary",
  cancelled: "destructive",
  expired: "outline",
  // contracts
  draft: "outline",
  transferred: "secondary",
  // purchase requests and orders
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  ordered: "secondary",
  pending_approval: "secondary",
  sent: "default",
  partially_received: "secondary",
  received: "secondary",
  closed: "outline",
  voided: "destructive",
  // vendors and departments
  inactive: "outline",
  archived: "outline",
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "outline"}>{labelize(status)}</Badge>
}
