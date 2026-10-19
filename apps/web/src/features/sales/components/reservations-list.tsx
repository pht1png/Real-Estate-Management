"use client"

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
import { daysUntil, formatDate, formatMoney, labelize } from "@/features/sales/lib/format"
import { type ReservationRow, type ReservationStatus, reservationStatuses } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

function ExpiresCell({ row }: { row: ReservationRow }) {
  if (!row.expiresAt) return "—"
  const days = daysUntil(row.expiresAt)
  const soon = row.status === "active" && days <= 7
  return (
    <Stacked
      primary={formatDate(row.expiresAt)}
      secondary={
        row.status === "active" && (
          <span className={soon ? "text-destructive" : undefined}>{days > 0 ? `in ${days} days` : "today"}</span>
        )
      }
    />
  )
}

const columns: Column<ReservationRow>[] = [
  { header: "No.", cell: (r) => <span className="font-medium">{r.reservationNumber}</span> },
  { header: "Unit", cell: (r) => <Stacked primary={r.unitNumber} secondary={r.projectName} /> },
  { header: "Customer", cell: (r) => <Stacked primary={r.contactName} secondary={r.phone} /> },
  { header: "Salesperson", cell: (r) => r.salesperson ?? "—" },
  { header: "Fee", cell: (r) => formatMoney(r.reservationFee), className: "text-right tabular-nums" },
  { header: "Reserved", cell: (r) => formatDate(r.reservedAt) },
  { header: "Expires", cell: (r) => <ExpiresCell row={r} /> },
  {
    header: "Status",
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={r.status} />
        {r.cancelReason && <span className="text-muted-foreground">{r.cancelReason}</span>}
      </div>
    ),
  },
]

export function ReservationsList() {
  const list = useListState<ReservationStatus>()
  const { data } = useQuery(
    trpc.sales.reservations.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: ReservationStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reservations"
        description="Units held for a buyer with a reservation fee, until they sign a contract or the hold expires."
      />
      <StatCards
        stats={reservationStatuses.map((status) => ({
          label: labelize(status),
          value: data ? countFor(status) : "–",
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search number, unit, customer or project"
        />
        <FilterSelect
          value={list.filter}
          onChange={list.setFilter}
          options={reservationStatuses}
          allLabel="All statuses"
        />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No reservations match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
    </div>
  )
}
