"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@real-estate-management/ui/components/card"
import { cn } from "@real-estate-management/ui/lib/utils"
import { CheckIcon, CircleIcon, TriangleAlertIcon } from "lucide-react"

import { StatusBadge } from "@/components/list/status-badge"
import type { BudgetWarning, TimelineEntry } from "@/features/procurement/types"
import { formatDate, formatMoney } from "@/lib/format"

export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{children || "—"}</span>
    </div>
  )
}

/** Status plus, while waiting for approval, who it's waiting on. */
export function ApprovalStatus({ status, step }: { status: string; step: "manager" | "owner" | null }) {
  return (
    <span className="flex items-center gap-1.5">
      <StatusBadge status={status} />
      {step && <Badge variant="outline">{step === "manager" ? "Manager" : "Owner"} step</Badge>}
    </span>
  )
}

type StepState = { label: string; who: string; name: string | null; at: string | Date | null; current: boolean }

/** The two approval steps: manager, then owner. */
export function ApprovalSteps({
  managerLabel,
  managerName,
  managerAt,
  ownerName,
  ownerAt,
  step,
  rejectionReason,
}: {
  managerLabel: string
  managerName: string | null
  managerAt: string | Date | null
  ownerName: string | null
  ownerAt: string | Date | null
  step: "manager" | "owner" | null
  rejectionReason: string | null
}) {
  const steps: StepState[] = [
    { label: "1. Manager", who: managerLabel, name: managerName, at: managerAt, current: step === "manager" },
    { label: "2. Owner", who: "The owner", name: ownerName, at: ownerAt, current: step === "owner" },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval</CardTitle>
        <CardDescription>Manager first, then the owner</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {steps.map((s) => (
          <div key={s.label} className="flex items-start gap-2">
            {s.at ? (
              <CheckIcon className="mt-0.5 size-4 text-primary" />
            ) : (
              <CircleIcon className={cn("mt-0.5 size-4", s.current ? "text-primary" : "text-muted-foreground")} />
            )}
            <div className="flex flex-col">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">
                {s.at
                  ? `Approved by ${s.name ?? "someone"} on ${formatDate(s.at)}`
                  : s.current
                    ? `Waiting on ${s.who.toLowerCase()}`
                    : s.who}
              </span>
            </div>
          </div>
        ))}
        {rejectionReason && (
          <p className="border-l-2 border-destructive pl-2 text-muted-foreground">Rejected: {rejectionReason}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function BudgetWarnings({ warnings }: { warnings: BudgetWarning[] }) {
  if (!warnings.length) return null
  return (
    <div className="flex flex-col gap-1 border border-destructive/50 p-3">
      <span className="flex items-center gap-1.5 font-medium">
        <TriangleAlertIcon className="size-4 text-destructive" />
        Over budget if approved
      </span>
      {warnings.map((w) => (
        <span key={w.budgetLineId} className="text-muted-foreground">
          {w.code} {w.name}: budget {formatMoney(w.budget)}, already committed {formatMoney(w.committed)}, this document{" "}
          {formatMoney(w.thisDocument)} → over by {formatMoney(w.over)}
        </span>
      ))}
      <span className="text-muted-foreground">You can still approve; this is a warning.</span>
    </div>
  )
}

const actionLabels: Record<string, string> = {
  created: "Created",
  updated: "Edited",
  submitted: "Submitted for approval",
  manager_approved: "Approved by the manager",
  approved: "Approved by the owner",
  rejected: "Rejected",
  revised: "Reopened for changes",
  cancelled: "Cancelled",
  ordered: "Ordered",
  order_cancelled: "Purchase order cancelled",
  sent: "Sent to the supplier",
  closed: "Closed",
  partially_received: "Partly received",
  received: "Fully received",
  goods_received: "Goods received",
  voided: "Receipt voided",
  receipt_voided: "Receipt voided",
}

function details(entry: TimelineEntry) {
  const c = entry.changes ?? {}
  const parts: string[] = []
  if (c.purchaseOrder) parts.push(String(c.purchaseOrder.to))
  if (c.goodsReceipt) parts.push(String(c.goodsReceipt.to))
  if (c.managerSkipped) parts.push("no other manager could approve, so it went straight to the owner")
  if (c.selfApproved) parts.push("approved their own request as the only owner")
  if (c.comment) parts.push(`“${String(c.comment.to)}”`)
  if (c.reason) parts.push(`“${String(c.reason.to)}”`)
  return parts.join(" · ")
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 && <p className="text-muted-foreground">Nothing yet.</p>}
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => {
            const extra = details(entry)
            return (
              <li key={entry.id} className="flex flex-col border-l-2 pl-3">
                <span className="font-medium">
                  {entry.entityType === "goods_receipt" && entry.action === "goods_received"
                    ? "Delivery recorded"
                    : (actionLabels[entry.action] ?? entry.action)}
                </span>
                <span className="text-muted-foreground">
                  {entry.userName ?? "Someone"} · {new Date(entry.createdAt).toLocaleString("en-GB")}
                </span>
                {extra && <span className="text-muted-foreground">{extra}</span>}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
