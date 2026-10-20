"use client"

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { ContractFormSheet, type ContractSheetTarget } from "@/features/sales/components/contract-form-sheet"
import {
  actionsColumn,
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
import { ReservationFormSheet } from "@/features/sales/components/reservation-form-sheet"
import { StatusBadge } from "@/components/list/status-badge"
import { useSalesPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { daysUntil, formatDate, formatMoney, labelize } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
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
          <span className={soon ? "text-destructive" : undefined}>
            {days > 0 ? `in ${days} days` : days === 0 ? "today" : `${-days} days ago`}
          </span>
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
    trpc.sales.reservations.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: ReservationStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  const { canCreate, canUpdate, canDelete } = useSalesPermissions()
  const sheet = useDialogState<ReservationRow>()
  const contractSheet = useDialogState<ContractSheetTarget>()
  const confirmCancel = useDialogState<ReservationRow>()
  const cancel = useMutation(
    trpc.sales.reservations.cancel.mutationOptions(mutationCallbacks("Reservation cancelled", confirmCancel.close)),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<ReservationRow>((row) => {
      const active = row.status === "active"
      return [
        {
          label: "Convert to contract",
          onClick: () => contractSheet.show({ kind: "convert", reservation: row }),
          hidden: !active || !canUpdate,
        },
        { label: "Edit", onClick: () => sheet.show(row), hidden: !active || !canUpdate },
        {
          label: "Cancel reservation",
          onClick: () => confirmCancel.show(row),
          destructive: true,
          hidden: !active || !canDelete,
        },
      ]
    }),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reservations"
        description="Units held for a buyer with a reservation fee, until they sign a contract or the hold expires."
        action={canCreate && <HeaderButton label="New reservation" onClick={() => sheet.show(null)} />}
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
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No reservations match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <ReservationFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} reservation={sheet.value} />
      <ContractFormSheet
        key={`contract-${contractSheet.key}`}
        open={contractSheet.open}
        onOpenChange={contractSheet.setOpen}
        target={contractSheet.value}
      />
      <ConfirmActionDialog
        open={confirmCancel.open}
        onOpenChange={confirmCancel.setOpen}
        title={`Cancel ${confirmCancel.value?.reservationNumber ?? "reservation"}?`}
        description={`Unit ${confirmCancel.value?.unitNumber ?? ""} becomes available again. The reservation fee payment stays on record.`}
        confirmLabel="Cancel reservation"
        destructive
        input={{ kind: "reason", label: "Reason" }}
        pending={cancel.isPending}
        onConfirm={(reason) => confirmCancel.value && cancel.mutate({ id: confirmCancel.value.id, reason })}
      />
    </div>
  )
}
