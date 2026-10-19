"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/features/sales/components/list-layout"
import { StatusBadge } from "@/features/sales/components/status-badge"
import { useListState } from "@/features/sales/hooks/use-list-state"
import { formatDate, formatMoney, formatMoneyCompact, labelize } from "@/features/sales/lib/format"
import { type ContractRow, type ContractStatus, contractStatuses } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

function PaidCell({ row }: { row: ContractRow }) {
  const percent = Math.min(100, Math.round((Number(row.paidAmount) / Number(row.netPrice)) * 100))
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="tabular-nums">
        {formatMoney(row.paidAmount)} <span className="text-muted-foreground">({percent}%)</span>
      </span>
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

const columns: Column<ContractRow>[] = [
  { header: "No.", cell: (r) => <span className="font-medium">{r.contractNumber}</span> },
  { header: "Unit", cell: (r) => <Stacked primary={r.unitNumber} secondary={r.projectName} /> },
  { header: "Buyer", cell: (r) => r.buyerName },
  { header: "Signed", cell: (r) => formatDate(r.contractDate) },
  {
    header: "Net price",
    cell: (r) => (
      <Stacked
        primary={formatMoney(r.netPrice)}
        secondary={Number(r.discountAmount) > 0 && `−${formatMoney(r.discountAmount)} discount`}
      />
    ),
    className: "text-right tabular-nums",
  },
  { header: "Paid", cell: (r) => <PaidCell row={r} /> },
  {
    header: "Transfer",
    cell: (r) =>
      r.transferredOn ? (
        <Stacked primary={formatDate(r.transferredOn)} secondary="Transferred" />
      ) : (
        <Stacked primary={formatDate(r.scheduledTransferDate)} secondary="Scheduled" />
      ),
  },
  {
    header: "Status",
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={r.status} />
        {r.overdueInstallments > 0 && <Badge variant="destructive">{r.overdueInstallments} overdue</Badge>}
      </div>
    ),
  },
]

export function ContractsList() {
  const list = useListState<ContractStatus>()
  const { data } = useQuery(
    trpc.sales.contracts.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const statFor = (status: ContractStatus) => data?.statusCounts.find((c) => c.status === status)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contracts"
        description="Agreements to sell, from signing through down payments to ownership transfer."
      />
      <StatCards
        stats={contractStatuses.map((status) => {
          const stat = statFor(status)
          return {
            label: labelize(status),
            value: data ? (stat?.count ?? 0) : "–",
            hint: stat?.value ? formatMoneyCompact(stat.value) : undefined,
            active: list.filter === status,
            onClick: () => list.setFilter(list.filter === status ? null : status),
          }
        })}
      />
      <Toolbar>
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search number, unit, buyer or project"
        />
        <FilterSelect
          value={list.filter}
          onChange={list.setFilter}
          options={contractStatuses}
          allLabel="All statuses"
        />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No contracts match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
    </div>
  )
}
