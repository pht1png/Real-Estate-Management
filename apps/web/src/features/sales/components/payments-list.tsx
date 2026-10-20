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
} from "@/components/list/list-layout"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, formatMoney, formatMoneyCompact, labelize } from "@/lib/format"
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
  { header: "Receipt", cell: (r) => <span className="font-medium">{r.receiptNumber}</span> },
  { header: "Paid", cell: (r) => formatDate(r.paidAt) },
  { header: "Payer", cell: (r) => r.payerName },
  { header: "Applied to", cell: (r) => <AppliedToCell row={r} /> },
  { header: "Method", cell: (r) => <Stacked primary={labelize(r.method)} secondary={r.bankReference} /> },
  { header: "Recorded by", cell: (r) => r.recordedBy ?? "—" },
  { header: "Amount", cell: (r) => formatMoney(r.amount), className: "text-right tabular-nums" },
]

export function PaymentsList() {
  const list = useListState<PaymentMethod>()
  const { data } = useQuery(
    trpc.sales.payments.queryOptions(
      { ...list.query, method: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const summary = data?.summary

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payments"
        description="Money received from buyers: reservation fees, installments and transfers."
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
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No payments match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
    </div>
  )
}
