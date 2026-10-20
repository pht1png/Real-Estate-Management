"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import Link from "next/link"

import {
  type Column,
  DataTable,
  FilterSelect,
  HeaderButton,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/components/list/list-layout"
import { OrderFormSheet } from "@/features/procurement/components/order-form-sheet"
import { ApprovalStatus } from "@/features/procurement/components/shared"
import { type OrderRow, type OrderStatus, orderStatuses } from "@/features/procurement/types"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format"
import { trpc } from "@/utils/trpc"

const columns: Column<OrderRow>[] = [
  {
    header: "Order",
    cell: (r) => (
      <Link href={`/procurement/purchase-orders/${r.id}`} className="hover:underline">
        <Stacked primary={r.poNumber} secondary={formatDate(r.orderDate)} />
      </Link>
    ),
  },
  { header: "Supplier", cell: (r) => <Stacked primary={r.supplierName} secondary={r.projectName} /> },
  { header: "Request", cell: (r) => r.prNumber ?? "Direct" },
  { header: "Expected", cell: (r) => formatDate(r.expectedDeliveryDate) },
  { header: "Total", cell: (r) => formatMoney(r.total), className: "text-right tabular-nums" },
  { header: "Status", cell: (r) => <ApprovalStatus status={r.status} step={r.approvalStep} /> },
]

const statCards: { status: OrderStatus; label: string }[] = [
  { status: "draft", label: "Drafts" },
  { status: "pending_approval", label: "Waiting for approval" },
  { status: "approved", label: "Approved, not sent" },
  { status: "sent", label: "Sent" },
  { status: "partially_received", label: "Partly received" },
  { status: "received", label: "Received" },
]

export function OrdersList() {
  const list = useListState<OrderStatus>()
  const { data } = useQuery(
    trpc.procurement.orders.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const { isStaff } = useProcurementPermissions()
  const sheet = useDialogState<null>()
  const byStatus = new Map(data?.statusCounts.map((s) => [s.status, s]))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase orders"
        description="Orders to suppliers. Approved by a Procurement manager, then the owner, before they're sent."
        action={isStaff && <HeaderButton label="New purchase order" onClick={() => sheet.show(null)} />}
      />
      <StatCards
        stats={statCards.map(({ status, label }) => ({
          label,
          value: byStatus.get(status)?.count ?? 0,
          hint: formatMoneyCompact(byStatus.get(status)?.total ?? 0),
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search number, supplier or project" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={orderStatuses} allLabel="All statuses" />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No purchase orders match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <OrderFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} order={null} />
    </div>
  )
}
