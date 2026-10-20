"use client"

import { FieldGroup } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import * as z from "zod"

import { CheckboxField, FieldRow, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import type { SupplierRow } from "@/features/procurement/types"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  taxId: z.union([z.string().regex(/^\d{13}$/, "Tax ID must be 13 digits"), z.literal("")]),
  category: z.string(),
  isSubcontractor: z.boolean(),
  contactName: z.string(),
  email: z.union([z.email("Enter a valid email"), z.literal("")]),
  phone: z.string(),
  addressLine: z.string(),
  district: z.string(),
  province: z.string(),
  postalCode: z.string(),
  paymentTermDays: z.string().regex(/^\d{1,3}$/, "Days, e.g. 30"),
  notes: z.string(),
})

const FORM_ID = "supplier-form"

export function SupplierFormSheet({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this supplier, or add a new one when null. */
  supplier: SupplierRow | null
}) {
  const close = () => onOpenChange(false)
  const create = useMutation(
    trpc.procurement.suppliers.create.mutationOptions(mutationCallbacks("Supplier added", close)),
  )
  const update = useMutation(
    trpc.procurement.suppliers.update.mutationOptions(mutationCallbacks("Supplier updated", close)),
  )

  const form = useForm({
    defaultValues: {
      name: supplier?.name ?? "",
      taxId: supplier?.taxId ?? "",
      category: supplier?.category ?? "",
      isSubcontractor: supplier?.isSubcontractor ?? false,
      contactName: supplier?.contactName ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      addressLine: supplier?.addressLine ?? "",
      district: supplier?.district ?? "",
      province: supplier?.province ?? "",
      postalCode: supplier?.postalCode ?? "",
      paymentTermDays: String(supplier?.paymentTermDays ?? 30),
      notes: supplier?.notes ?? "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = { ...value, paymentTermDays: Number(value.paymentTermDays) }
      if (supplier) update.mutate({ id: supplier.id, ...fields })
      else create.mutate(fields)
    },
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={supplier ? `Edit ${supplier.name}` : "New supplier"}
      description="Material suppliers and subcontractors."
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
          <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
          <FieldRow>
            <form.Field name="category">
              {(field) => <TextField field={field} label="Category" placeholder="e.g. Concrete, Steel" />}
            </form.Field>
            <form.Field name="taxId">{(field) => <TextField field={field} label="Tax ID" />}</form.Field>
          </FieldRow>
          <form.Field name="isSubcontractor">
            {(field) => (
              <CheckboxField
                field={field}
                label="Subcontractor"
                description="Provides services; withholding tax usually applies."
              />
            )}
          </form.Field>
          <FieldRow>
            <form.Field name="contactName">{(field) => <TextField field={field} label="Contact person" />}</form.Field>
            <form.Field name="phone">{(field) => <TextField field={field} label="Phone" type="tel" />}</form.Field>
          </FieldRow>
          <form.Field name="email">{(field) => <TextField field={field} label="Email" type="email" />}</form.Field>
          <form.Field name="addressLine">{(field) => <TextField field={field} label="Address" />}</form.Field>
          <FieldRow>
            <form.Field name="district">{(field) => <TextField field={field} label="District" />}</form.Field>
            <form.Field name="province">{(field) => <TextField field={field} label="Province" />}</form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="postalCode">{(field) => <TextField field={field} label="Postal code" />}</form.Field>
            <form.Field name="paymentTermDays">
              {(field) => <TextField field={field} label="Payment terms (days)" type="number" />}
            </form.Field>
          </FieldRow>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
