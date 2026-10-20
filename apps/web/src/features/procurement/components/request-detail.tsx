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
import { StatusBadge } from "@/components/list/status-badge"
import { OrderFormSheet } from "@/features/procurement/components/order-form-sheet"
import { RequestFormSheet } from "@/features/procurement/components/request-form-sheet"
import { ApprovalStatus, ApprovalSteps, BudgetWarnings, Info, Timeline } from "@/features/procurement/components/shared"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { formatDate, formatMoney } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

type Confirmable = "approve" | "reject" | "cancel"

const confirmCopy: Record<
  Confirmable,
  { title: string; description: string; label: string; destructive?: boolean; input?: ConfirmInput }
> = {
  approve: {
    title: "Approve this request?",
    description: "At the manager step it moves on to the owner; at the owner step it's approved for ordering.",
    label: "Approve",
    input: { kind: "reason", label: "Comment (optional)", optional: true },
  },
  reject: {
    title: "Reject this request?",
    description: "It goes back to the requester, who can change it and submit again.",
    label: "Reject",
    destructive: true,
    input: { kind: "reason", label: "Reason" },
  },
  cancel: {
    title: "Cancel this request?",
    description: "Cancelled requests can't be reopened.",
    label: "Cancel request",
    destructive: true,
    input: { kind: "reason", label: "Reason" },
  },
}

export function RequestDetail({ id }: { id: string }) {
  const { data: pr, error } = useQuery(trpc.procurement.requests.get.queryOptions({ id }))
  const { isStaff } = useProcurementPermissions()
  const editSheet = useDialogState<null>()
  const orderSheet = useDialogState<null>()
  const confirm = useDialogState<Confirmable>()
  useBreadcrumbLabel(pr?.prNumber)

  const done = (message: string) => mutationCallbacks(message, confirm.close)
  const submit = useMutation(trpc.procurement.requests.submit.mutationOptions(done("Submitted for approval")))
  const revise = useMutation(trpc.procurement.requests.revise.mutationOptions(done("Reopened as a draft")))
  const approve = useMutation(trpc.procurement.requests.approve.mutationOptions(done("Approved")))
  const reject = useMutation(trpc.procurement.requests.reject.mutationOptions(done("Rejected")))
  const cancel = useMutation(trpc.procurement.requests.cancel.mutationOptions(done("Request cancelled")))

  const warnIfOverBudget = (result: { budgetWarnings: unknown[] }) => {
    if (result.budgetWarnings.length) toast.warning("Approved, but it goes over budget on some lines.")
  }

  if (error) return <p className="text-xs">{error.message}</p>
  if (!pr) return <Skeleton className="h-96 w-full" />

  const can = (action: (typeof pr.actions)[number]) => pr.actions.includes(action)
  const copy = confirm.value ? confirmCopy[confirm.value] : null
  const pending = approve.isPending || reject.isPending || cancel.isPending
  const onConfirm = (value: string) => {
    if (confirm.value === "approve") approve.mutate({ id, comment: value || null }, { onSuccess: warnIfOverBudget })
    if (confirm.value === "reject") reject.mutate({ id, reason: value })
    if (confirm.value === "cancel") cancel.mutate({ id, reason: value })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{pr.prNumber}</h1>
            <ApprovalStatus status={pr.status} step={pr.approvalStep} />
          </div>
          <p className="text-xs text-muted-foreground">
            {pr.projectName} · {pr.departmentName ?? "No department"} · requested by {pr.requesterName ?? "—"} on{" "}
            {formatDate(pr.createdAt)}
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
          {can("revise") && (
            <Button variant="outline" disabled={revise.isPending} onClick={() => revise.mutate({ id })}>
              Reopen to change
            </Button>
          )}
          {can("reject") && (
            <Button variant="outline" onClick={() => confirm.show("reject")}>
              Reject
            </Button>
          )}
          {can("approve") && <Button onClick={() => confirm.show("approve")}>Approve</Button>}
          {pr.status === "approved" && isStaff && (
            <Button onClick={() => orderSheet.show(null)}>Create purchase order</Button>
          )}
          {can("cancel") && (
            <Button variant="destructive" onClick={() => confirm.show("cancel")}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {can("approve") && <BudgetWarnings warnings={pr.budgetWarnings} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Info label="Needed by">{formatDate(pr.neededBy)}</Info>
              <Info label="Estimated total">{formatMoney(pr.estimatedTotal)}</Info>
              <Info label="Purchase orders">
                {pr.orders.length > 0 &&
                  pr.orders.map((o) => (
                    <Link key={o.id} href={`/procurement/purchase-orders/${o.id}`} className="mr-2 hover:underline">
                      {o.poNumber} <StatusBadge status={o.status} />
                    </Link>
                  ))}
              </Info>
              <div className="col-span-full">
                <Info label="What it's for">{pr.justification}</Info>
              </div>
              {pr.cancelReason && (
                <div className="col-span-full">
                  <Info label="Cancelled because">{pr.cancelReason}</Info>
                </div>
              )}
              {pr.notes && (
                <div className="col-span-full">
                  <Info label="Notes">{pr.notes}</Info>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Budget line</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Est. unit price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pr.lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                      No items yet. Edit the request to add some.
                    </TableCell>
                  </TableRow>
                )}
                {pr.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell>{l.budgetLineCode ? `${l.budgetLineCode} ${l.budgetLineName}` : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(l.quantity).toLocaleString()} {l.unitOfMeasure}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.estimatedUnitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(Number(l.quantity) * Number(l.estimatedUnitPrice ?? 0))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Estimated total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(pr.estimatedTotal)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ApprovalSteps
            managerLabel={`${pr.departmentName ?? "Department"} manager`}
            managerName={pr.managerApproverName}
            managerAt={pr.managerApprovedAt}
            ownerName={pr.ownerApproverName}
            ownerAt={pr.approvedAt}
            step={pr.approvalStep}
            rejectionReason={pr.status === "rejected" || pr.status === "draft" ? pr.rejectionReason : null}
          />
          <Timeline entries={pr.timeline} />
        </div>
      </div>

      <RequestFormSheet key={editSheet.key} open={editSheet.open} onOpenChange={editSheet.setOpen} request={pr} />
      <OrderFormSheet
        key={`order-${orderSheet.key}`}
        open={orderSheet.open}
        onOpenChange={orderSheet.setOpen}
        order={null}
        fromRequest={pr}
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
