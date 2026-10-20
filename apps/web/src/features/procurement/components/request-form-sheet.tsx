"use client"

import { FieldGroup } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import * as z from "zod"

import { DateField, FieldRow, SelectField, TextareaField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import {
  emptyLine,
  type LineDraft,
  LineItemsField,
  toLineInput,
  validateLines,
} from "@/components/forms/line-items-field"
import type { RequestDetail } from "@/features/procurement/types"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  projectId: z.string().min(1, "Pick a project"),
  departmentId: z.string().min(1, "Pick a department"),
  neededBy: z.string(),
  justification: z.string(),
  notes: z.string(),
  lines: z.array(z.custom<LineDraft>()),
})

const FORM_ID = "purchase-request-form"

export function RequestFormSheet({
  open,
  onOpenChange,
  request,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this draft, or raise a new request when null. */
  request: RequestDetail | null
}) {
  const router = useRouter()
  const close = () => onOpenChange(false)
  const { data: options } = useQuery(trpc.procurement.options.form.queryOptions(undefined, { enabled: open }))
  const create = useMutation(
    trpc.procurement.requests.create.mutationOptions(mutationCallbacks("Request saved as draft", close)),
  )
  const update = useMutation(
    trpc.procurement.requests.update.mutationOptions(mutationCallbacks("Request updated", close)),
  )

  const departments = options?.departments ?? []
  const form = useForm({
    defaultValues: {
      projectId: request?.projectId ?? "",
      departmentId: request?.departmentId ?? "",
      neededBy: request?.neededBy ?? "",
      justification: request?.justification ?? "",
      notes: request?.notes ?? "",
      lines: request?.lines.map((l) => ({
        description: l.description,
        quantity: String(Number(l.quantity)),
        unitOfMeasure: l.unitOfMeasure,
        unitPrice: l.estimatedUnitPrice ?? "",
        budgetLineId: l.budgetLineId ?? "",
      })) ?? [emptyLine()],
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = {
        projectId: value.projectId,
        departmentId: value.departmentId,
        neededBy: value.neededBy || null,
        justification: value.justification,
        notes: value.notes,
        lines: toLineInput(value.lines).map(({ unitPrice, purchaseRequestItemId: _, ...l }) => ({
          ...l,
          estimatedUnitPrice: unitPrice,
        })),
      }
      if (request) update.mutate({ id: request.id, ...fields })
      else create.mutate(fields, { onSuccess: (row) => router.push(`/procurement/purchase-requests/${row.id}`) })
    },
  })

  // Options load after the sheet opens: preselect the department when there is only one
  const onlyDepartment = departments.length === 1 ? departments[0]?.id : undefined
  useEffect(() => {
    if (onlyDepartment && !form.getFieldValue("departmentId")) form.setFieldValue("departmentId", onlyDepartment)
  }, [onlyDepartment, form])

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={request ? `Edit ${request.prNumber}` : "New purchase request"}
      description="Saved as a draft. Submit it when it's ready for your department manager, then the owner."
      formId={FORM_ID}
      pending={create.isPending || update.isPending}
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <FieldRow>
            <form.Field name="projectId">
              {(field) => (
                <SelectField
                  field={field}
                  label="Project"
                  options={(options?.projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                />
              )}
            </form.Field>
            <form.Field name="departmentId">
              {(field) => (
                <SelectField
                  field={field}
                  label="Department"
                  description="Its manager approves first."
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
            </form.Field>
          </FieldRow>
          <form.Field name="neededBy">{(field) => <DateField field={field} label="Needed by" />}</form.Field>
          <form.Field name="justification">
            {(field) => (
              <TextareaField field={field} label="What it's for" placeholder="e.g. Level 3 slab pour, Building A" />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.projectId}>
            {(projectId) => (
              <form.Field
                name="lines"
                validators={{ onSubmit: ({ value }) => validateLines(value, { required: false }) }}
              >
                {(field) => (
                  <LineItemsField
                    field={field}
                    priceLabel="Est. unit price (฿)"
                    totalLabel="Estimated total"
                    budgetLines={(options?.budgetLines ?? [])
                      .filter((b) => b.projectId === projectId)
                      .map((b) => ({ value: b.id, label: `${b.code} ${b.name}` }))}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
