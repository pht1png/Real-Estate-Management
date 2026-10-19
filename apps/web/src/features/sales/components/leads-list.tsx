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
import { formatMoneyCompact, labelize } from "@/features/sales/lib/format"
import { type LeadRow, type LeadStatus, leadStatuses } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const columns: Column<LeadRow>[] = [
  { header: "Contact", cell: (r) => <Stacked primary={r.contactName} secondary={r.phone ?? r.email} /> },
  { header: "Interested in", cell: (r) => <Stacked primary={r.projectName ?? "—"} secondary={r.unitTypeName} /> },
  { header: "Source", cell: (r) => labelize(r.source) },
  {
    header: "Budget",
    cell: (r) =>
      r.budgetMin || r.budgetMax ? `${formatMoneyCompact(r.budgetMin)} – ${formatMoneyCompact(r.budgetMax)}` : "—",
  },
  { header: "Assigned to", cell: (r) => r.assignedTo ?? "Unassigned" },
  {
    header: "Status",
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={r.status} />
        {r.lostReason && <span className="text-muted-foreground">{r.lostReason}</span>}
      </div>
    ),
  },
]

export function LeadsList() {
  const list = useListState<LeadStatus>()
  const { data } = useQuery(
    trpc.sales.leads.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: LeadStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Prospects interested in your projects, from first contact to won or lost."
      />
      <StatCards
        stats={leadStatuses.map((status) => ({
          label: labelize(status),
          value: data ? countFor(status) : "–",
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, phone, email or project" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={leadStatuses} allLabel="All statuses" />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No leads match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
    </div>
  )
}
