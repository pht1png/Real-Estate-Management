"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog, type ConfirmInput } from "@/components/forms/confirm-action-dialog"
import { ContractFormSheet, type ContractSheetTarget } from "@/features/sales/components/contract-form-sheet"
import {
  actionsColumn,
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/components/list/list-layout"
import { PaymentFormSheet } from "@/features/sales/components/payment-form-sheet"
import { StatusBadge } from "@/components/list/status-badge"
import { useSalesPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, formatMoney, formatMoneyCompact, labelize } from "@/lib/format"
import { mutationCallbacks, today } from "@/lib/mutation"
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
  {
    header: "Unit",
    cell: (r) => (
      <Stacked
        primary={r.houseNumber ? `${r.unitNumber} · ${r.houseNumber}` : r.unitNumber}
        secondary={r.projectName}
      />
    ),
  },
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
        {r.cancelReason && <span className="text-muted-foreground">{r.cancelReason}</span>}
      </div>
    ),
  },
]

type ContractAction = "activate" | "transfer" | "cancel" | "delete"

const actionCopy: Record<
  ContractAction,
  { title: string; description: string; confirm: string; destructive?: boolean; input?: ConfirmInput }
> = {
  activate: {
    title: "Mark contract as signed?",
    description: "The prices and payment schedule are locked once the contract is active.",
    confirm: "Activate",
  },
  transfer: {
    title: "Record ownership transfer?",
    description: "Every installment must be paid. The unit is marked as transferred to the buyer.",
    confirm: "Mark transferred",
    input: { kind: "date", label: "Transferred at the Land Office on", defaultValue: today() },
  },
  cancel: {
    title: "Cancel contract?",
    description: "Unpaid installments are waived and the unit becomes available. Payments received stay on record.",
    confirm: "Cancel contract",
    destructive: true,
    input: { kind: "reason", label: "Reason" },
  },
  delete: {
    title: "Delete draft contract?",
    description: "The reservation becomes active again and the unit goes back to reserved.",
    confirm: "Delete draft",
    destructive: true,
  },
}

export function ContractsList() {
  const list = useListState<ContractStatus>()
  const { data } = useQuery(
    trpc.sales.contracts.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const statFor = (status: ContractStatus) => data?.statusCounts.find((c) => c.status === status)

  const { canUpdate, canDelete, canRecordPayment } = useSalesPermissions()
  const sheet = useDialogState<ContractSheetTarget>()
  const paymentSheet = useDialogState<ContractRow>()
  const confirm = useDialogState<{ action: ContractAction; row: ContractRow }>()

  const done = (message: string) => mutationCallbacks(message, confirm.close)
  const activate = useMutation(trpc.sales.contracts.activate.mutationOptions(done("Contract activated")))
  const transfer = useMutation(trpc.sales.contracts.markTransferred.mutationOptions(done("Ownership transferred")))
  const cancel = useMutation(trpc.sales.contracts.cancel.mutationOptions(done("Contract cancelled")))
  const remove = useMutation(trpc.sales.contracts.delete.mutationOptions(done("Draft deleted")))
  const pending = activate.isPending || transfer.isPending || cancel.isPending || remove.isPending

  const runConfirmed = (value: string) => {
    if (!confirm.value) return
    const { action, row } = confirm.value
    if (action === "activate") activate.mutate({ id: row.id })
    if (action === "transfer") transfer.mutate({ id: row.id, transferredOn: value })
    if (action === "cancel") cancel.mutate({ id: row.id, reason: value })
    if (action === "delete") remove.mutate({ id: row.id })
  }

  const tableColumns = [
    ...columns,
    actionsColumn<ContractRow>((row) => {
      const draft = row.status === "draft"
      const active = row.status === "active"
      const ask = (action: ContractAction) => () => confirm.show({ action, row })
      return [
        { label: "Record payment", onClick: () => paymentSheet.show(row), hidden: !active || !canRecordPayment },
        {
          label: "Edit",
          onClick: () => sheet.show({ kind: "edit", contract: row }),
          hidden: !(draft || active) || !canUpdate,
        },
        { label: "Activate", onClick: ask("activate"), hidden: !draft || !canUpdate },
        { label: "Mark transferred", onClick: ask("transfer"), hidden: !active || !canUpdate },
        {
          label: "Cancel contract",
          onClick: ask("cancel"),
          destructive: true,
          hidden: !(draft || active) || !canDelete,
        },
        { label: "Delete draft", onClick: ask("delete"), destructive: true, hidden: !draft || !canDelete },
      ]
    }),
  ]

  const copy = confirm.value ? actionCopy[confirm.value.action] : actionCopy.activate

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contracts"
        description="Agreements to sell, from signing through down payments to ownership transfer. Create one from an active reservation."
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
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No contracts match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <ContractFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} target={sheet.value} />
      <PaymentFormSheet
        key={`payment-${paymentSheet.key}`}
        open={paymentSheet.open}
        onOpenChange={paymentSheet.setOpen}
        contractId={paymentSheet.value?.id}
      />
      <ConfirmActionDialog
        key={`confirm-${confirm.key}`}
        open={confirm.open}
        onOpenChange={confirm.setOpen}
        title={copy.title}
        description={
          confirm.value
            ? `${confirm.value.row.contractNumber} · ${confirm.value.row.buyerName}. ${copy.description}`
            : copy.description
        }
        confirmLabel={copy.confirm}
        destructive={copy.destructive}
        input={copy.input}
        pending={pending}
        onConfirm={runConfirmed}
      />
    </div>
  )
}
