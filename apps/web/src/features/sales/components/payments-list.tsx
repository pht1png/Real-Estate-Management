"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
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
import { PaymentFormSheet } from "@/features/sales/components/payment-form-sheet"
import { useSalesPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, formatMoney, formatMoneyCompact, labelize } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
import { type PaymentMethod, type PaymentRow, paymentMethods } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

function AppliedToCell({ row }: { row: PaymentRow }) {
  if (row.contractNumber) {
    return (
      <Stacked
        primary={row.contractNumber}
        secondary={row.installmentType && `#${row.installmentSequence} · ${labelize(row.installmentType)}`}
      />
    )
  }
  return <Stacked primary={row.reservationNumber ?? "—"} secondary="Reservation fee" />
}

const columns: Column<PaymentRow>[] = [
  {
    header: "Receipt",
    cell: (r) => (
      <div className="flex flex-col items-start gap-1">
        <span className="font-medium">{r.receiptNumber}</span>
        {r.voidedAt && <Badge variant="destructive">Voided</Badge>}
      </div>
    ),
  },
  { header: "Paid", cell: (r) => formatDate(r.paidAt) },
  { header: "Payer", cell: (r) => r.payerName },
  { header: "Applied to", cell: (r) => <AppliedToCell row={r} /> },
  { header: "Method", cell: (r) => <Stacked primary={labelize(r.method)} secondary={r.bankReference} /> },
  { header: "Recorded by", cell: (r) => r.recordedBy ?? "—" },
  {
    header: "Amount",
    cell: (r) =>
      r.voidedAt ? (
        <Stacked primary={<s className="text-muted-foreground">{formatMoney(r.amount)}</s>} secondary={r.voidReason} />
      ) : (
        formatMoney(r.amount)
      ),
    className: "text-right tabular-nums",
  },
]

export function PaymentsList() {
  const list = useListState<PaymentMethod>()
  const { data } = useQuery(
    trpc.sales.payments.list.queryOptions(
      { ...list.query, method: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const summary = data?.summary

  const { canRecordPayment: canUpdate, canVoid: canDelete } = useSalesPermissions()
  const sheet = useDialogState<null>()
  const confirmVoid = useDialogState<PaymentRow>()
  const voidPayment = useMutation(
    trpc.sales.payments.void.mutationOptions(mutationCallbacks("Payment voided", confirmVoid.close)),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<PaymentRow>((row) => [
      {
        label: "Void payment",
        onClick: () => confirmVoid.show(row),
        destructive: true,
        hidden: Boolean(row.voidedAt) || !canDelete,
      },
    ]),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payments"
        description="Money received from buyers: reservation fees, installments and transfers."
        action={canUpdate && <HeaderButton label="Record payment" onClick={() => sheet.show(null)} />}
      />
      <StatCards
        stats={[
          {
            label: "Received, last 30 days",
            value: summary ? formatMoneyCompact(summary.receivedLast30Days) : "–",
          },
          {
            label: "Received, all time",
            value: summary ? formatMoneyCompact(summary.receivedAllTime) : "–",
            hint: summary && `${summary.paymentCount} payments`,
          },
          {
            label: "Due in next 30 days",
            value: summary ? formatMoneyCompact(summary.dueNext30Days) : "–",
            hint: summary && `${summary.dueNext30DaysCount} installments`,
          },
        ]}
      />
      <Toolbar>
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search receipt, payer, contract or reference"
        />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={paymentMethods} allLabel="All methods" />
      </Toolbar>
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No payments match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <PaymentFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} />
      <ConfirmActionDialog
        key={`void-${confirmVoid.key}`}
        open={confirmVoid.open}
        onOpenChange={confirmVoid.setOpen}
        title={`Void receipt ${confirmVoid.value?.receiptNumber ?? ""}?`}
        description="The receipt stays on record but no longer counts as paid. Its installment re-opens if needed."
        confirmLabel="Void payment"
        destructive
        input={{ kind: "reason", label: "Reason" }}
        pending={voidPayment.isPending}
        onConfirm={(reason) => confirmVoid.value && voidPayment.mutate({ id: confirmVoid.value.id, reason })}
      />
    </div>
  )
}
