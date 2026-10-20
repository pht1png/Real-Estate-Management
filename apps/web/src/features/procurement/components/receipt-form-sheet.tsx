"use client"

import { Button } from "@real-estate-management/ui/components/button"
import { Field, FieldGroup, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import { Textarea } from "@real-estate-management/ui/components/textarea"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"

import { FormSheet } from "@/components/forms/form-sheet"
import type { OrderDetail } from "@/features/procurement/types"
import { mutationCallbacks, today } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const FORM_ID = "goods-receipt-form"

type LineInput = { received: string; rejected: string }

/** Records a delivery against a PO: what arrived per line (up to what's still to come) and what was refused. */
export function ReceiptFormSheet({
  open,
  onOpenChange,
  order,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OrderDetail
}) {
  const close = () => onOpenChange(false)
  const create = useMutation(
    trpc.procurement.receipts.create.mutationOptions(mutationCallbacks("Delivery recorded", close)),
  )
  const openLines = order.lines.filter((l) => l.remaining > 0)
  const [receivedOn, setReceivedOn] = useState(today())
  const [deliveryNote, setDeliveryNote] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<Record<string, LineInput>>(
    Object.fromEntries(openLines.map((l) => [l.id, { received: "", rejected: "" }])),
  )
  const [error, setError] = useState<string | null>(null)
  const set = (id: string, patch: Partial<LineInput>) =>
    setLines((prev) => ({ ...prev, [id]: { ...(prev[id] as LineInput), ...patch } }))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const entered = openLines
      .map((l) => ({
        line: l,
        received: Number(lines[l.id]?.received) || 0,
        rejected: Number(lines[l.id]?.rejected) || 0,
      }))
      .filter((l) => l.received > 0 || l.rejected > 0)
    const over = entered.find((l) => l.received > l.line.remaining)
    if (!entered.length) return setError("Enter what arrived on at least one line.")
    if (over) return setError(`${over.line.description}: only ${over.line.remaining} still to come.`)
    if (entered.some((l) => l.received < 0 || l.rejected < 0)) return setError("Quantities can't be negative.")
    setError(null)
    create.mutate({
      orderId: order.id,
      receivedOn,
      deliveryNoteNumber: deliveryNote,
      notes,
      lines: entered.map((l) => ({ orderItemId: l.line.id, received: l.received, rejected: l.rejected })),
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Receive goods for ${order.poNumber}`}
      description={`From ${order.supplierName}. Partial deliveries are fine; record the rest when it arrives.`}
      formId={FORM_ID}
      submitLabel="Record delivery"
      pending={create.isPending}
    >
      <form id={FORM_ID} onSubmit={submit}>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="gr-date">Received on</FieldLabel>
              <Input id="gr-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="gr-dn">Delivery note no.</FieldLabel>
              <Input id="gr-dn" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            {openLines.map((l) => (
              <div key={l.id} className="flex flex-col gap-2 border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{l.description}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set(l.id, { received: String(l.remaining) })}
                  >
                    All {l.remaining} {l.unitOfMeasure}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  Ordered {Number(l.quantity).toLocaleString()} · received {l.received.toLocaleString()} · still to come{" "}
                  {l.remaining.toLocaleString()} {l.unitOfMeasure}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    aria-label={`${l.description} received`}
                    type="number"
                    step="any"
                    min="0"
                    max={l.remaining}
                    placeholder="Received (accepted)"
                    value={lines[l.id]?.received ?? ""}
                    onChange={(e) => set(l.id, { received: e.target.value })}
                  />
                  <Input
                    aria-label={`${l.description} rejected`}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Refused (damaged)"
                    value={lines[l.id]?.rejected ?? ""}
                    onChange={(e) => set(l.id, { rejected: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>
          <Field>
            <FieldLabel htmlFor="gr-notes">Notes</FieldLabel>
            <Textarea id="gr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
