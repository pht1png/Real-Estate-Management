"use client"

import { Button } from "@real-estate-management/ui/components/button"
import { Field, FieldError, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@real-estate-management/ui/components/select"
import type { AnyFieldApi } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { formatMoney } from "@/lib/format"

/** One purchase line as the form holds it: numbers stay strings until submit. */
export type LineDraft = {
  description: string
  quantity: string
  unitOfMeasure: string
  unitPrice: string
  budgetLineId: string
  /** The request line a PO line came from; kept as is. */
  purchaseRequestItemId?: string | null
}

export const emptyLine = (): LineDraft => ({
  description: "",
  quantity: "1",
  unitOfMeasure: "",
  unitPrice: "",
  budgetLineId: "",
})

export const lineTotal = (line: LineDraft) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)

/** First problem with the lines, or undefined. Used as the `lines` field validator. */
export function validateLines(lines: LineDraft[], { required }: { required: boolean }) {
  if (required && lines.length === 0) return "Add at least one line"
  for (const [i, line] of lines.entries()) {
    if (!line.description.trim()) return `Line ${i + 1}: describe the item`
    if (!(Number(line.quantity) > 0)) return `Line ${i + 1}: quantity must be more than zero`
    if (!line.unitOfMeasure.trim()) return `Line ${i + 1}: unit is required`
    if (line.unitPrice === "" || Number(line.unitPrice) < 0) return `Line ${i + 1}: enter a unit price`
  }
  return undefined
}

/** Form lines → API lines (numbers, null budget line). */
export const toLineInput = (lines: LineDraft[]) =>
  lines.map((l) => ({
    description: l.description.trim(),
    quantity: Number(l.quantity),
    unitOfMeasure: l.unitOfMeasure.trim(),
    unitPrice: Number(l.unitPrice),
    budgetLineId: l.budgetLineId || null,
    purchaseRequestItemId: l.purchaseRequestItemId ?? null,
  }))

const NONE = "__none"

/**
 * Editable list of purchase lines bound to one array field.
 *   <form.Field name="lines" validators={{ onSubmit: ({ value }) => validateLines(value, …) }}>
 *     {(field) => <LineItemsField field={field} budgetLines={…} />}
 *   </form.Field>
 */
export function LineItemsField({
  field,
  label = "Items",
  priceLabel = "Unit price (฿)",
  totalLabel = "Total",
  budgetLines = [],
}: {
  field: AnyFieldApi
  label?: string
  priceLabel?: string
  totalLabel?: string
  budgetLines?: { value: string; label: string }[]
}) {
  const lines: LineDraft[] = field.state.value ?? []
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const set = (next: LineDraft[]) => field.handleChange(next)
  const update = (index: number, patch: Partial<LineDraft>) =>
    set(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  const total = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const budgetItems = [{ value: NONE, label: "No budget line" }, ...budgetLines]

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-3">
        {lines.map((line, i) => (
          <div key={i} className="flex flex-col gap-2 border p-3">
            <div className="flex items-start gap-2">
              <span className="pt-2 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
              <Input
                aria-label={`Line ${i + 1} description`}
                placeholder="Item or service, e.g. Ready-mix concrete 240 ksc"
                value={line.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => set(lines.filter((_, j) => j !== i))}
                aria-label={`Remove line ${i + 1}`}
              >
                <Trash2Icon />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 pl-5">
              <Input
                aria-label={`Line ${i + 1} quantity`}
                type="number"
                step="any"
                min="0"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
              />
              <Input
                aria-label={`Line ${i + 1} unit`}
                placeholder="Unit (m³, ton…)"
                value={line.unitOfMeasure}
                onChange={(e) => update(i, { unitOfMeasure: e.target.value })}
              />
              <Input
                aria-label={`Line ${i + 1} ${priceLabel}`}
                type="number"
                step="any"
                min="0"
                placeholder={priceLabel}
                value={line.unitPrice}
                onChange={(e) => update(i, { unitPrice: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pl-5">
              {budgetLines.length > 0 ? (
                <Select
                  items={budgetItems}
                  value={line.budgetLineId || NONE}
                  onValueChange={(v) => update(i, { budgetLineId: v === NONE || v === null ? "" : String(v) })}
                >
                  <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={`Line ${i + 1} budget line`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {budgetItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span />
              )}
              <span className="text-xs tabular-nums">{formatMoney(lineTotal(line))}</span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={() => set([...lines, emptyLine()])}>
            <PlusIcon data-icon="inline-start" />
            Add line
          </Button>
          <span className="text-xs">
            {totalLabel} <span className="font-medium tabular-nums">{formatMoney(total)}</span>
          </span>
        </div>
      </div>
      {isInvalid && (
        <FieldError errors={field.state.meta.errors.map((message: unknown) => ({ message: String(message) }))} />
      )}
    </Field>
  )
}
