"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@real-estate-management/ui/components/empty"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { type Column, DataTable, PageHeader, Stacked } from "@/components/list/list-layout"
import { formatDate, formatMoney } from "@/lib/format"
import { trpc } from "@/utils/trpc"

type DocumentHref = `/procurement/purchase-requests/${string}` | `/procurement/purchase-orders/${string}`

type Item = {
  id: string
  href: DocumentHref
  number: string
  kind: "Request" | "Order"
  step: "manager" | "owner" | null
  title: string
  subtitle: string | null
  amount: string
  waitingSince: string | Date
  by: string | null
}

const columns: Column<Item>[] = [
  {
    header: "Document",
    cell: (r) => (
      <Link href={r.href} className="hover:underline">
        <Stacked primary={r.number} secondary={r.kind === "Request" ? "Purchase request" : "Purchase order"} />
      </Link>
    ),
  },
  { header: "For", cell: (r) => <Stacked primary={r.title} secondary={r.subtitle} /> },
  { header: "By", cell: (r) => r.by ?? "—" },
  { header: "Your step", cell: (r) => <Badge variant="outline">{r.step === "owner" ? "Owner" : "Manager"}</Badge> },
  { header: "Waiting since", cell: (r) => formatDate(r.waitingSince) },
  { header: "Amount", cell: (r) => formatMoney(r.amount), className: "text-right tabular-nums" },
]

/** Requests and orders waiting on the current user at their approval step. */
export function ApprovalsInbox() {
  const { data } = useQuery(trpc.procurement.approvals.inbox.queryOptions())
  const rows: Item[] | undefined = data && [
    ...data.requests.map((r) => ({
      id: r.id,
      href: `/procurement/purchase-requests/${r.id}` as DocumentHref,
      number: r.prNumber,
      kind: "Request" as const,
      step: r.approvalStep,
      title: `${r.projectName} · ${r.departmentName ?? "—"}`,
      subtitle: r.justification,
      amount: r.estimatedTotal,
      waitingSince: r.waitingSince,
      by: r.requesterName,
    })),
    ...data.orders.map((o) => ({
      id: o.id,
      href: `/procurement/purchase-orders/${o.id}` as DocumentHref,
      number: o.poNumber,
      kind: "Order" as const,
      step: o.approvalStep,
      title: o.supplierName,
      subtitle: o.projectName,
      amount: o.total,
      waitingSince: o.waitingSince,
      by: o.creatorName,
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        description="Purchase requests and orders waiting on you. Managers approve first, then the owner."
      />
      {rows?.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nothing waiting on you</EmptyTitle>
            <EmptyDescription>When a request or order reaches your step, it shows up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} rows={rows} emptyMessage="Nothing waiting on you." />
      )}
    </div>
  )
}
