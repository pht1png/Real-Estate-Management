"use client"

import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as z from "zod"

import { DateField, FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { formatMoneyCompact, labelize } from "@/lib/format"
import { addDaysIso, mutationCallbacks, today } from "@/lib/mutation"
import { paymentMethods, type ReservationRow } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const formSchema = z
  .object({
    unitId: z.string(),
    contactId: z.string(),
    leadId: z.string(),
    salespersonId: z.string(),
    reservationFee: z.string(),
    paidAt: z.iso.date("Pick a date"),
    method: z.enum(paymentMethods),
    bankReference: z.string(),
    expiresAt: z.iso.date("Pick a date"),
    notes: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.expiresAt < v.paidAt) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Must be after the reservation date" })
    }
  })

const createSchema = formSchema.superRefine((v, ctx) => {
  if (!v.unitId) ctx.addIssue({ code: "custom", path: ["unitId"], message: "Pick a unit" })
  if (!v.contactId) ctx.addIssue({ code: "custom", path: ["contactId"], message: "Pick a customer" })
  if (!(Number(v.reservationFee) > 0)) {
    ctx.addIssue({ code: "custom", path: ["reservationFee"], message: "Enter the fee received" })
  }
})

const FORM_ID = "reservation-form"
const toIsoDate = (value: string | Date | null) => (value ? new Date(value).toLocaleDateString("en-CA") : "")

export function ReservationFormSheet({
  open,
  onOpenChange,
  reservation,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this active reservation (expiry, salesperson, notes), or create a new one when null. */
  reservation: ReservationRow | null
}) {
  const close = () => onOpenChange(false)
  const isEdit = Boolean(reservation)
  const { data: options } = useQuery(trpc.sales.options.form.queryOptions(undefined, { enabled: open }))
  const create = useMutation(trpc.sales.reservations.create.mutationOptions(mutationCallbacks("Unit reserved", close)))
  const update = useMutation(
    trpc.sales.reservations.update.mutationOptions(mutationCallbacks("Reservation updated", close)),
  )

  const form = useForm({
    defaultValues: {
      unitId: "",
      contactId: "",
      leadId: "",
      salespersonId: reservation?.salespersonId ?? "",
      reservationFee: "",
      paidAt: reservation ? toIsoDate(reservation.reservedAt) : today(),
      method: "bank_transfer",
      bankReference: "",
      expiresAt: reservation ? toIsoDate(reservation.expiresAt) : addDaysIso(30),
      notes: reservation?.notes ?? "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: isEdit ? formSchema : createSchema },
    onSubmit: ({ value }) => {
      if (reservation) {
        update.mutate({
          id: reservation.id,
          expiresAt: value.expiresAt,
          salespersonId: value.salespersonId || null,
          notes: value.notes,
        })
        return
      }
      create.mutate({
        unitId: value.unitId,
        contactId: value.contactId,
        leadId: value.leadId || null,
        salespersonId: value.salespersonId || null,
        reservationFee: Number(value.reservationFee),
        expiresAt: value.expiresAt,
        notes: value.notes,
        payment: { method: value.method, paidAt: value.paidAt, bankReference: value.bankReference },
      })
    },
  })

  const projectName = (projectId: string) => options?.projects.find((p) => p.id === projectId)?.name ?? ""

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={reservation ? `Edit ${reservation.reservationNumber}` : "New reservation"}
      description={
        reservation
          ? `${reservation.unitNumber} · ${reservation.projectName} · ${reservation.contactName}`
          : "Hold an available unit for a customer who has paid the reservation fee."
      }
      formId={FORM_ID}
      submitLabel={isEdit ? "Save" : "Reserve unit"}
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
          {!isEdit && (
            <>
              <form.Field name="unitId">
                {(field) => (
                  <SelectField
                    field={field}
                    label="Unit"
                    description="Only available units are listed."
                    options={(options?.availableUnits ?? []).map((u) => ({
                      value: u.id,
                      label: `${u.unitNumber} · ${projectName(u.projectId)}${u.unitTypeName ? ` · ${u.unitTypeName}` : ""} · ${formatMoneyCompact(u.listPrice)}`,
                    }))}
                  />
                )}
              </form.Field>
              <form.Field name="contactId" listeners={{ onChange: () => form.setFieldValue("leadId", "") }}>
                {(field) => (
                  <SelectField
                    field={field}
                    label="Customer"
                    options={(options?.contacts ?? []).map((c) => ({
                      value: c.id,
                      label: c.phone ? `${c.name} · ${c.phone}` : c.name,
                    }))}
                  />
                )}
              </form.Field>
              <form.Subscribe selector={(s) => s.values.contactId}>
                {(contactId) => {
                  const leads = (options?.openLeads ?? []).filter((l) => l.contactId === contactId)
                  return (
                    <form.Field name="leadId">
                      {(field) => (
                        <SelectField
                          field={field}
                          label="From lead"
                          emptyLabel={leads.length ? "No lead" : "This customer has no open leads"}
                          disabled={!leads.length}
                          options={leads.map((l) => ({
                            value: l.id,
                            label: `${projectName(l.projectId ?? "") || "No project"} · ${labelize(l.status)}`,
                          }))}
                        />
                      )}
                    </form.Field>
                  )
                }}
              </form.Subscribe>
              <FieldSeparator />
              <FieldRow>
                <form.Field name="reservationFee">
                  {(field) => <MoneyField field={field} label="Reservation fee (฿)" placeholder="20000" />}
                </form.Field>
                <form.Field name="paidAt">{(field) => <DateField field={field} label="Paid on" />}</form.Field>
              </FieldRow>
              <FieldRow>
                <form.Field name="method">
                  {(field) => (
                    <SelectField
                      field={field}
                      label="Payment method"
                      options={paymentMethods.map((m) => ({ value: m, label: labelize(m) }))}
                    />
                  )}
                </form.Field>
                <form.Field name="bankReference">
                  {(field) => <TextField field={field} label="Reference" placeholder="Transfer / cheque no." />}
                </form.Field>
              </FieldRow>
              <FieldSeparator />
            </>
          )}
          <form.Field name="expiresAt">
            {(field) => (
              <DateField
                field={field}
                label="Hold expires on"
                description="The unit is released if no contract is signed."
              />
            )}
          </form.Field>
          <form.Field name="salespersonId">
            {(field) => (
              <SelectField
                field={field}
                label="Salesperson"
                emptyLabel={isEdit ? "Nobody" : "Me"}
                options={(options?.members ?? []).map((m) => ({ value: m.id, label: m.name }))}
              />
            )}
          </form.Field>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
