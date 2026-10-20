"use client"

import { FieldGroup } from "@real-estate-management/ui/components/field"
import { useForm, useStore } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as z from "zod"

import { DateField, FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { formatDate, formatMoney, labelize } from "@/lib/format"
import { mutationCallbacks, today } from "@/lib/mutation"
import { type InstallmentRow, paymentMethods } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  contractId: z.string().min(1, "Pick a contract"),
  installmentId: z.string(),
  amount: z.string().refine((v) => Number(v) > 0, "Enter the amount received"),
  method: z.enum(paymentMethods),
  paidAt: z.iso.date("Pick a date"),
  bankReference: z.string(),
  notes: z.string(),
})

const FORM_ID = "payment-form"

const remaining = (i: InstallmentRow) => Number(i.amount) - Number(i.paidAmount)
const isOpen = (i: InstallmentRow) => i.status === "pending" || i.status === "partially_paid"

export function PaymentFormSheet({
  open,
  onOpenChange,
  contractId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select this contract (when opened from a contract row). */
  contractId?: string
}) {
  const close = () => onOpenChange(false)
  const { data: options } = useQuery(trpc.sales.options.form.queryOptions(undefined, { enabled: open }))
  const record = useMutation(trpc.sales.payments.record.mutationOptions(mutationCallbacks("Payment recorded", close)))

  const form = useForm({
    defaultValues: {
      contractId: contractId ?? "",
      installmentId: "",
      amount: "",
      method: "bank_transfer",
      paidAt: today(),
      bankReference: "",
      notes: "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      record.mutate({
        contractId: value.contractId,
        installmentId: value.installmentId || null,
        amount: Number(value.amount),
        method: value.method,
        paidAt: value.paidAt,
        bankReference: value.bankReference,
        notes: value.notes,
      })
    },
  })

  const selectedContract = useStore(form.store, (s) => s.values.contractId)
  const selectedInstallment = useStore(form.store, (s) => s.values.installmentId)
  const { data: installments } = useQuery(
    trpc.sales.contracts.installments.queryOptions({ contractId: selectedContract }, { enabled: !!selectedContract }),
  )
  const openInstallments = (installments ?? []).filter(isOpen)
  const picked = openInstallments.find((i) => i.id === selectedInstallment)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description="Money received from a buyer against an active contract."
      formId={FORM_ID}
      submitLabel="Record payment"
      pending={record.isPending}
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="contractId"
            listeners={{
              onChange: () => {
                form.setFieldValue("installmentId", "")
                form.setFieldValue("amount", "")
              },
            }}
          >
            {(field) => (
              <SelectField
                field={field}
                label="Contract"
                description="Only active contracts are listed."
                options={(options?.activeContracts ?? []).map((c) => ({
                  value: c.id,
                  label: `${c.contractNumber} · ${c.buyerName}`,
                }))}
              />
            )}
          </form.Field>
          <form.Field
            name="installmentId"
            listeners={{
              // Default the amount to whatever is still due on the picked installment
              onChange: ({ value }) => {
                const installment = openInstallments.find((i) => i.id === value)
                form.setFieldValue("amount", installment ? String(remaining(installment)) : "")
              },
            }}
          >
            {(field) => (
              <SelectField
                field={field}
                label="For installment"
                emptyLabel="Not tied to an installment"
                disabled={!selectedContract}
                description={
                  picked ? `${formatMoney(remaining(picked))} still due of ${formatMoney(picked.amount)}.` : undefined
                }
                options={openInstallments.map((i) => ({
                  value: i.id,
                  label: `#${i.sequence} ${labelize(i.type)} · due ${formatDate(i.dueDate)} · ${formatMoney(remaining(i))} left`,
                }))}
              />
            )}
          </form.Field>
          <FieldRow>
            <form.Field name="amount">{(field) => <MoneyField field={field} label="Amount (฿)" />}</form.Field>
            <form.Field name="paidAt">{(field) => <DateField field={field} label="Received on" />}</form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="method">
              {(field) => (
                <SelectField
                  field={field}
                  label="Method"
                  options={paymentMethods.map((m) => ({ value: m, label: labelize(m) }))}
                />
              )}
            </form.Field>
            <form.Field name="bankReference">
              {(field) => <TextField field={field} label="Reference" placeholder="Transfer / cheque no." />}
            </form.Field>
          </FieldRow>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
