"use client"

import { Button } from "@real-estate-management/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@real-estate-management/ui/components/card"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import {
  actionsColumn,
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  Toolbar,
} from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import type { ReceiptRow } from "@/features/procurement/types"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const columns: Column<ReceiptRow>[] = [
  { header: "Receipt", cell: (r) => <Stacked primary={r.grNumber} secondary={formatDate(r.receivedOn)} /> },
  {
    header: "Purchase order",
    cell: (r) => (
      <Link href={`/procurement/purchase-orders/${r.orderId}`} className="hover:underline">
        <Stacked primary={r.poNumber} secondary={r.supplierName} />
      </Link>
    ),
  },
  { header: "Project", cell: (r) => r.projectName },
  {
    header: "Received by",
    cell: (r) => (
      <Stacked primary={r.receiverName ?? "—"} secondary={r.deliveryNoteNumber && `DN ${r.deliveryNoteNumber}`} />
    ),
  },
  { header: "Lines", cell: (r) => r.lineCount, className: "text-right tabular-nums" },
  {
    header: "Status",
    cell: (r) =>
      r.voidedAt ? (
        <Stacked primary={<StatusBadge status="voided" />} secondary={r.voidReason} />
      ) : (
        <StatusBadge status="received" />
      ),
  },
]

/** POs goods can be received against, so the site can find them without going through the orders list. */
function AwaitingDelivery() {
  const { data } = useQuery(trpc.procurement.orders.list.queryOptions({ receivable: true, page: 1 }))
  if (!data?.rows.length) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Waiting for delivery</CardTitle>
        <CardDescription>
          {data.total} approved or sent purchase order{data.total === 1 ? "" : "s"}. Open one to record what arrived.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {data.rows.map((o) => (
          <Button
            key={o.id}
            variant="outline"
            size="sm"
            render={<Link href={`/procurement/purchase-orders/${o.id}`} />}
            nativeButton={false}
          >
            {o.poNumber} · {o.supplierName} · expected {formatDate(o.expectedDeliveryDate)}
          </Button>
        ))}
      </CardContent>
    </Card>
  )
}

export function ReceiptsList() {
  const list = useListState<"active" | "voided">()
  const { data } = useQuery(
    trpc.procurement.receipts.list.queryOptions(
      { ...list.query, voided: list.filter === null ? undefined : list.filter === "voided" },
      { placeholderData: keepPreviousData },
    ),
  )
  const { canReceive, canVoidReceipt } = useProcurementPermissions()
  const confirmVoid = useDialogState<ReceiptRow>()
  const voidReceipt = useMutation(
    trpc.procurement.receipts.void.mutationOptions(mutationCallbacks("Receipt voided", confirmVoid.close)),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<ReceiptRow>((row) => [
      {
        label: "Void",
        onClick: () => confirmVoid.show(row),
        destructive: true,
        hidden: !canVoidReceipt || Boolean(row.voidedAt) || row.orderStatus === "closed",
      },
    ]),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Goods receipts"
        description="What actually arrived against each purchase order. Recorded by Construction or Procurement."
      />
      {canReceive && <AwaitingDelivery />}
      <Toolbar>
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search receipt, PO, delivery note or supplier"
        />
        <FilterSelect
          value={list.filter}
          onChange={list.setFilter}
          options={["active", "voided"] as const}
          allLabel="All receipts"
          labelFor={(v) => (v === "active" ? "Counted" : "Voided")}
        />
      </Toolbar>
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No goods receipts match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <ConfirmActionDialog
        key={`void-${confirmVoid.key}`}
        open={confirmVoid.open}
        onOpenChange={confirmVoid.setOpen}
        title={`Void ${confirmVoid.value?.grNumber ?? "receipt"}?`}
        description="The receipt stays for the record but stops counting; the quantities are expected again."
        confirmLabel="Void receipt"
        destructive
        input={{ kind: "reason", label: "Reason" }}
        pending={voidReceipt.isPending}
        onConfirm={(reason) => confirmVoid.value && voidReceipt.mutate({ id: confirmVoid.value.id, reason })}
      />
    </div>
  )
}
