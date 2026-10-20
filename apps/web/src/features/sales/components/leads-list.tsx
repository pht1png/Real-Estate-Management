"use client"

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { LeadFormSheet } from "@/features/sales/components/lead-form-sheet"
import {
  actionsColumn,
  type Column,
  DataTable,
  HeaderButton,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import { useSalesPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatMoneyCompact, labelize } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
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
    trpc.sales.leads.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: LeadStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  const { canCreate, canUpdate, canDelete } = useSalesPermissions()
  const sheet = useDialogState<LeadRow>()
  const confirmDelete = useDialogState<LeadRow>()
  const remove = useMutation(
    trpc.sales.leads.delete.mutationOptions(mutationCallbacks("Lead deleted", confirmDelete.close)),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<LeadRow>((row) => [
      { label: "Edit", onClick: () => sheet.show(row), hidden: !canUpdate },
      { label: "Delete", onClick: () => confirmDelete.show(row), destructive: true, hidden: !canDelete },
    ]),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Prospects interested in your projects, from first contact to won or lost."
        action={canCreate && <HeaderButton label="New lead" onClick={() => sheet.show(null)} />}
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
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No leads match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
      <LeadFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} lead={sheet.value} />
      <ConfirmActionDialog
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title="Delete lead?"
        description={`This removes the lead for ${confirmDelete.value?.contactName ?? "this contact"}. The contact stays.`}
        confirmLabel="Delete lead"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirmDelete.value && remove.mutate({ id: confirmDelete.value.id })}
      />
    </div>
  )
}
