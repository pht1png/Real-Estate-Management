"use client"

import { Button } from "@real-estate-management/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@real-estate-management/ui/components/card"
import { Skeleton } from "@real-estate-management/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@real-estate-management/ui/components/table"
import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"

import { useBreadcrumbLabel } from "@/components/breadcrumb-label"
import { ConfirmActionDialog, type ConfirmInput } from "@/components/forms/confirm-action-dialog"
import { RowActions } from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import { OrderFormSheet } from "@/features/procurement/components/order-form-sheet"
import { ReceiptFormSheet } from "@/features/procurement/components/receipt-form-sheet"
import { ApprovalStatus, ApprovalSteps, BudgetWarnings, Info, Timeline } from "@/features/procurement/components/shared"
import type { OrderDetail as Detail } from "@/features/procurement/types"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { formatDate, formatMoney } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

type Confirmable = "approve" | "reject" | "cancel" | "close"

const confirmCopy: Record<
  Confirmable,
  { title: string; description: string; label: string; destructive?: boolean; input?: ConfirmInput }
> = {
  approve: {
    title: "Approve this purchase order?",
    description: "At the manager step it moves on to the owner; at the owner step it can be sent to the supplier.",
    label: "Approve",
    input: { kind: "reason", label: "Comment (optional)", optional: true },
  },
  reject: {
    title: "Send this purchase order back?",
    description: "It goes back to draft for Procurement to fix and submit again.",
    label: "Reject",
    destructive: true,
    input: { kind: "reason", label: "Reason" },
  },
  cancel: {
    title: "Cancel this purchase order?",
    description: "If it came from a request, the request can be ordered again.",
    label: "Cancel order",
    destructive: true,
    input: { kind: "reason", label: "Reason" },
  },
  close: {
    title: "Close this purchase order?",
    description: "Nothing more is expected from the supplier. Closed orders can't receive goods or void receipts.",
    label: "Close order",
  },
}

function ReceiptsCard({ order, canVoid }: { order: Detail; canVoid: boolean }) {
  const confirmVoid = useDialogState<Detail["receipts"][number]>()
  const voidReceipt = useMutation(
    trpc.procurement.receipts.void.mutationOptions(mutationCallbacks("Receipt voided", confirmVoid.close)),
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliveries</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {order.receipts.length === 0 && <p className="text-muted-foreground">Nothing received yet.</p>}
        {order.receipts.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0">
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                {r.grNumber} {r.voidedAt && <StatusBadge status="voided" />}
              </span>
              <span className="text-muted-foreground">
                {formatDate(r.receivedOn)} · {r.receiverName ?? "—"}
                {r.deliveryNoteNumber && ` · DN ${r.deliveryNoteNumber}`}
              </span>
              {r.voidReason && <span className="text-muted-foreground">Voided: {r.voidReason}</span>}
            </div>
            <RowActions
              actions={[
                {
                  label: "Void",
                  onClick: () => confirmVoid.show(r),
                  destructive: true,
                  hidden: !canVoid || Boolean(r.voidedAt) || order.status === "closed",
                },
              ]}
            />
          </div>
        ))}
      </CardContent>
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
    </Card>
  )
}

export function OrderDetail({ id }: { id: string }) {
  const { data: po, error } = useQuery(trpc.procurement.orders.get.queryOptions({ id }))
  const { canVoidReceipt } = useProcurementPermissions()
  const editSheet = useDialogState<null>()
  const receiveSheet = useDialogState<null>()
  const confirm = useDialogState<Confirmable>()
  useBreadcrumbLabel(po?.poNumber)

  const done = (message: string) => mutationCallbacks(message, confirm.close)
  const submit = useMutation(trpc.procurement.orders.submit.mutationOptions(done("Submitted for approval")))
  const approve = useMutation(trpc.procurement.orders.approve.mutationOptions(done("Approved")))
  const reject = useMutation(trpc.procurement.orders.reject.mutationOptions(done("Sent back to draft")))
  const markSent = useMutation(trpc.procurement.orders.markSent.mutationOptions(done("Marked as sent")))
  const close = useMutation(trpc.procurement.orders.close.mutationOptions(done("Purchase order closed")))
  const cancel = useMutation(trpc.procurement.orders.cancel.mutationOptions(done("Purchase order cancelled")))

  const warnIfOverBudget = (result: { budgetWarnings: unknown[] }) => {
    if (result.budgetWarnings.length) toast.warning("Approved, but it goes over budget on some lines.")
  }

  if (error) return <p className="text-xs">{error.message}</p>
  if (!po) return <Skeleton className="h-96 w-full" />

  const can = (action: (typeof po.actions)[number]) => po.actions.includes(action)
  const copy = confirm.value ? confirmCopy[confirm.value] : null
  const pending = approve.isPending || reject.isPending || cancel.isPending || close.isPending
  const onConfirm = (value: string) => {
    if (confirm.value === "approve") approve.mutate({ id, comment: value || null }, { onSuccess: warnIfOverBudget })
    if (confirm.value === "reject") reject.mutate({ id, reason: value })
    if (confirm.value === "cancel") cancel.mutate({ id, reason: value })
    if (confirm.value === "close") close.mutate({ id })
  }
  const showReceived = !["draft", "pending_approval", "approved"].includes(po.status) || po.receipts.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{po.poNumber}</h1>
            <ApprovalStatus status={po.status} step={po.approvalStep} />
          </div>
          <p className="text-xs text-muted-foreground">
            {po.supplierName} · {po.projectName} · created by {po.creatorName ?? "—"} on {formatDate(po.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("edit") && (
            <Button variant="outline" onClick={() => editSheet.show(null)}>
              Edit
            </Button>
          )}
          {can("submit") && (
            <Button disabled={submit.isPending} onClick={() => submit.mutate({ id })}>
              Submit for approval
            </Button>
          )}
          {can("reject") && (
            <Button variant="outline" onClick={() => confirm.show("reject")}>
              Reject
            </Button>
          )}
          {can("approve") && <Button onClick={() => confirm.show("approve")}>Approve</Button>}
          {can("markSent") && (
            <Button disabled={markSent.isPending} onClick={() => markSent.mutate({ id })}>
              Mark as sent
            </Button>
          )}
          {po.canReceive && <Button onClick={() => receiveSheet.show(null)}>Receive goods</Button>}
          {can("close") && (
            <Button variant="outline" onClick={() => confirm.show("close")}>
              Close
            </Button>
          )}
          {can("cancel") && (
            <Button variant="destructive" onClick={() => confirm.show("cancel")}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {can("approve") && <BudgetWarnings warnings={po.budgetWarnings} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Info label="Supplier">
                {po.supplierCode} · {po.supplierName}
              </Info>
              <Info label="Order date">{formatDate(po.orderDate)}</Info>
              <Info label="Expected delivery">{formatDate(po.expectedDeliveryDate)}</Info>
              <Info label="Request">
                {po.purchaseRequestId && (
                  <Link href={`/procurement/purchase-requests/${po.purchaseRequestId}`} className="hover:underline">
                    {po.prNumber}
                  </Link>
                )}
              </Info>
              <Info label="Withholding tax">{Number(po.whtRate) > 0 ? `${Number(po.whtRate)}%` : "None"}</Info>
              <Info label="Deliver to">{po.deliveryAddress}</Info>
              {po.cancelReason && (
                <div className="col-span-full">
                  <Info label="Cancelled because">{po.cancelReason}</Info>
                </div>
              )}
              {po.notes && (
                <div className="col-span-full">
                  <Info label="Notes">{po.notes}</Info>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  {showReceived && <TableHead className="text-right">Received</TableHead>}
                  {showReceived && <TableHead className="text-right">To come</TableHead>}
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {po.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{l.description}</span>
                        {l.budgetLineCode && (
                          <span className="text-muted-foreground">
                            {l.budgetLineCode} {l.budgetLineName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(l.quantity).toLocaleString()} {l.unitOfMeasure}
                    </TableCell>
                    {showReceived && (
                      <TableCell className="text-right tabular-nums">{l.received.toLocaleString()}</TableCell>
                    )}
                    {showReceived && (
                      <TableCell className="text-right tabular-nums">{l.remaining.toLocaleString()}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{formatMoney(l.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {[
                  ["Subtotal", po.subtotal],
                  ...(Number(po.discountAmount) > 0 ? [["Discount", -Number(po.discountAmount)] as const] : []),
                  [`VAT ${Number(po.vatRate)}%`, po.vatAmount],
                  ["Total", po.total],
                ].map(([label, value]) => (
                  <TableRow key={String(label)}>
                    <TableCell colSpan={showReceived ? 5 : 3}>{label}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(value)}</TableCell>
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ApprovalSteps
            managerLabel="Procurement manager"
            managerName={po.managerApproverName}
            managerAt={po.managerApprovedAt}
            ownerName={po.ownerApproverName}
            ownerAt={po.approvedAt}
            step={po.approvalStep}
            rejectionReason={po.status === "draft" ? po.rejectionReason : null}
          />
          <ReceiptsCard order={po} canVoid={canVoidReceipt} />
          <Timeline entries={po.timeline} />
        </div>
      </div>

      <OrderFormSheet key={editSheet.key} open={editSheet.open} onOpenChange={editSheet.setOpen} order={po} />
      <ReceiptFormSheet
        key={`receive-${receiveSheet.key}`}
        open={receiveSheet.open}
        onOpenChange={receiveSheet.setOpen}
        order={po}
      />
      {copy && (
        <ConfirmActionDialog
          key={`confirm-${confirm.key}`}
          open={confirm.open}
          onOpenChange={confirm.setOpen}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.label}
          destructive={copy.destructive}
          input={copy.input}
          pending={pending}
          onConfirm={onConfirm}
        />
      )}
    </div>
  )
}
