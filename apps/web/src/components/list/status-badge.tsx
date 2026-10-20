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
  // requisitions
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  // vendors and departments
  inactive: "outline",
  archived: "outline",
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={variants[status] ?? "outline"}>{labelize(status)}</Badge>
}
