"use client"

import { poTotals } from "@real-estate-management/api/lib/procurement-rules"
import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { useForm, useStore } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import * as z from "zod"

import { DateField, FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { type LineDraft, LineItemsField, toLineInput, validateLines } from "@/components/forms/line-items-field"
import type { OrderDetail, RequestDetail } from "@/features/procurement/types"
import { formatMoney } from "@/lib/format"
import { addDaysIso, mutationCallbacks, today } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  supplierId: z.string().min(1, "Pick a supplier"),
  orderDate: z.iso.date("Pick a date"),
  expectedDeliveryDate: z.string(),
  deliveryAddress: z.string(),
  discountAmount: z.string(),
  vatRate: z.string(),
  whtRate: z.string(),
  notes: z.string(),
  lines: z.array(z.custom<LineDraft>()),
})
type FormValues = z.input<typeof formSchema>

const FORM_ID = "purchase-order-form"

const requestLines = (pr: Pick<RequestDetail, "lines">): LineDraft[] =>
  pr.lines.map((l) => ({
    description: l.description,
    quantity: String(Number(l.quantity)),
    unitOfMeasure: l.unitOfMeasure,
    unitPrice: l.estimatedUnitPrice ?? "",
    budgetLineId: l.budgetLineId ?? "",
    purchaseRequestItemId: l.id,
  }))

function Totals({ values }: { values: FormValues }) {
  const totals = poTotals(
    toLineInput(values.lines).map((l) => ({ quantity: l.quantity || 0, unitPrice: l.unitPrice || 0 })),
    Number(values.discountAmount) || 0,
    Number(values.vatRate) || 0,
  )
  const wht = ((totals.subtotal - totals.discount) * (Number(values.whtRate) || 0)) / 100
  const row = (label: string, value: number, strong?: boolean) => (
    <div className="flex justify-between">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-medium tabular-nums" : "tabular-nums"}>{formatMoney(value)}</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-1 border p-3 text-xs">
      {row("Subtotal", totals.subtotal)}
      {totals.discount > 0 && row("Discount", -totals.discount)}
      {row(`VAT ${values.vatRate}%`, totals.vat)}
      {row("Total", totals.total, true)}
      {wht > 0 && row(`Withholding tax ${values.whtRate}% (deducted when paying)`, -wht)}
    </div>
  )
}

export function OrderFormSheet({
  open,
  onOpenChange,
  order,
  fromRequest,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this draft PO; null for a new one. */
  order: OrderDetail | null
  /** Order this approved request (its project and lines are copied). */
  fromRequest?: RequestDetail | null
}) {
  const router = useRouter()
  const close = () => onOpenChange(false)
  const { data: options } = useQuery(trpc.procurement.options.form.queryOptions(undefined, { enabled: open }))
  const createFromRequest = useMutation(
    trpc.procurement.orders.createFromRequest.mutationOptions(mutationCallbacks("Purchase order created", close)),
  )
  const create = useMutation(
    trpc.procurement.orders.create.mutationOptions(mutationCallbacks("Purchase order created", close)),
  )
  const update = useMutation(
    trpc.procurement.orders.update.mutationOptions(mutationCallbacks("Purchase order updated", close)),
  )
  const goToOrder = (row: { id: string }) => router.push(`/procurement/purchase-orders/${row.id}`)

  const form = useForm({
    defaultValues: {
      requestId: fromRequest?.id ?? order?.purchaseRequestId ?? "",
      projectId: fromRequest?.projectId ?? order?.projectId ?? "",
      supplierId: order?.supplierId ?? "",
      orderDate: order?.orderDate ?? today(),
      expectedDeliveryDate: order?.expectedDeliveryDate ?? addDaysIso(14),
      deliveryAddress: order?.deliveryAddress ?? (fromRequest ? `${fromRequest.projectName} site office` : ""),
      discountAmount: order ? String(Number(order.discountAmount)) : "",
      vatRate: order ? String(Number(order.vatRate)) : "7",
      whtRate: order ? String(Number(order.whtRate)) : "0",
      notes: order?.notes ?? "",
      lines: order
        ? order.lines.map((l) => ({
            description: l.description,
            quantity: String(Number(l.quantity)),
            unitOfMeasure: l.unitOfMeasure,
            unitPrice: l.unitPrice,
            budgetLineId: l.budgetLineId ?? "",
            purchaseRequestItemId: l.purchaseRequestItemId,
          }))
        : fromRequest
          ? requestLines(fromRequest)
          : [],
    } as FormValues,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = {
        supplierId: value.supplierId,
        orderDate: value.orderDate,
        expectedDeliveryDate: value.expectedDeliveryDate || null,
        deliveryAddress: value.deliveryAddress,
        discountAmount: Number(value.discountAmount) || 0,
        vatRate: Number(value.vatRate),
        whtRate: Number(value.whtRate),
        notes: value.notes,
        lines: toLineInput(value.lines),
      }
      if (order) update.mutate({ id: order.id, ...fields })
      else if (value.requestId)
        createFromRequest.mutate({ requestId: value.requestId, ...fields }, { onSuccess: goToOrder })
      else create.mutate({ projectId: value.projectId, ...fields }, { onSuccess: goToOrder })
    },
  })

  // A new PO started from the list can still be based on an approved request: load it and copy its lines
  const isNewDirect = !order && !fromRequest
  const pickedRequestId = useStore(form.store, (s) => s.values.requestId)
  const { data: pickedRequest } = useQuery(
    trpc.procurement.requests.get.queryOptions(
      { id: pickedRequestId },
      { enabled: open && isNewDirect && Boolean(pickedRequestId) },
    ),
  )
  useEffect(() => {
    if (!pickedRequest || !isNewDirect) return
    form.setFieldValue("projectId", pickedRequest.projectId)
    form.setFieldValue("lines", requestLines(pickedRequest))
    if (!form.getFieldValue("deliveryAddress")) {
      form.setFieldValue("deliveryAddress", `${pickedRequest.projectName} site office`)
    }
  }, [pickedRequest, isNewDirect, form])

  const title = order ? `Edit ${order.poNumber}` : fromRequest ? `Order ${fromRequest.prNumber}` : "New purchase order"

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Saved as a draft. Submit it for approval by a Procurement manager, then the owner."
      formId={FORM_ID}
      pending={create.isPending || createFromRequest.isPending || update.isPending}
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          {isNewDirect && (
            <form.Field name="requestId">
              {(field) => (
                <SelectField
                  field={field}
                  label="From request"
                  emptyLabel="No request (direct order)"
                  description="Approved requests that haven't been ordered yet."
                  options={(options?.approvedRequests ?? []).map((r) => ({
                    value: r.id,
                    label: `${r.prNumber} · ${r.justification ?? formatMoney(r.estimatedTotal)}`,
                  }))}
                />
              )}
            </form.Field>
          )}
          <form.Subscribe selector={(s) => s.values.requestId}>
            {(requestId) => (
              <form.Field
                name="projectId"
                validators={{ onSubmit: ({ value }) => (!order && !value ? "Pick a project" : undefined) }}
              >
                {(field) => (
                  <SelectField
                    field={field}
                    label="Project"
                    disabled={Boolean(order || requestId)}
                    options={(options?.projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="supplierId">
            {(field) => (
              <SelectField
                field={field}
                label="Supplier"
                options={(options?.suppliers ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
              />
            )}
          </form.Field>
          <FieldRow>
            <form.Field name="orderDate">{(field) => <DateField field={field} label="Order date" />}</form.Field>
            <form.Field name="expectedDeliveryDate">
              {(field) => <DateField field={field} label="Expected delivery" />}
            </form.Field>
          </FieldRow>
          <form.Field name="deliveryAddress">
            {(field) => <TextField field={field} label="Deliver to" placeholder="Site office address" />}
          </form.Field>
          <FieldSeparator />
          <form.Subscribe selector={(s) => s.values.projectId}>
            {(projectId) => (
              <form.Field
                name="lines"
                validators={{ onSubmit: ({ value }) => validateLines(value, { required: true }) }}
              >
                {(field) => (
                  <LineItemsField
                    field={field}
                    label="Lines"
                    totalLabel="Subtotal"
                    budgetLines={(options?.budgetLines ?? [])
                      .filter((b) => b.projectId === projectId)
                      .map((b) => ({ value: b.id, label: `${b.code} ${b.name}` }))}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <FieldRow>
            <form.Field name="discountAmount">
              {(field) => <MoneyField field={field} label="Discount (฿)" />}
            </form.Field>
            <form.Field name="vatRate">
              {(field) => (
                <SelectField
                  field={field}
                  label="VAT"
                  options={[
                    { value: "7", label: "7%" },
                    { value: "0", label: "No VAT" },
                  ]}
                />
              )}
            </form.Field>
          </FieldRow>
          <form.Field name="whtRate">
            {(field) => (
              <SelectField
                field={field}
                label="Withholding tax"
                description="Usually 3% for subcontracted services, 1% for transport."
                options={["0", "1", "2", "3", "5"].map((v) => ({ value: v, label: v === "0" ? "None" : `${v}%` }))}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values}>{(values) => <Totals values={values} />}</form.Subscribe>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
