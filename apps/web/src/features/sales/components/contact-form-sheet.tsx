"use client"

import { FieldGroup } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import * as z from "zod"

import { FieldRow, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { mutationCallbacks } from "@/lib/mutation"
import type { ContactRow } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const formSchema = z
  .object({
    type: z.enum(["individual", "company"]),
    firstName: z.string(),
    lastName: z.string(),
    companyName: z.string(),
    phone: z.string(),
    email: z.union([z.email("Enter a valid email"), z.literal("")]),
    lineId: z.string(),
    taxId: z.union([z.string().regex(/^\d{13}$/, "Tax ID must be 13 digits"), z.literal("")]),
    addressLine: z.string(),
    subdistrict: z.string(),
    district: z.string(),
    province: z.string(),
    postalCode: z.string(),
    notes: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "company" && !v.companyName.trim()) {
      ctx.addIssue({ code: "custom", path: ["companyName"], message: "Company name is required" })
    }
    if (v.type === "individual" && !v.firstName.trim()) {
      ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" })
    }
  })

const FORM_ID = "contact-form"

export function ContactFormSheet({
  open,
  onOpenChange,
  contact,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this contact, or create a new one when null. */
  contact: ContactRow | null
}) {
  const close = () => onOpenChange(false)
  const create = useMutation(trpc.sales.contacts.create.mutationOptions(mutationCallbacks("Contact created", close)))
  const update = useMutation(trpc.sales.contacts.update.mutationOptions(mutationCallbacks("Contact updated", close)))

  const form = useForm({
    defaultValues: {
      type: contact?.type ?? "individual",
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      companyName: contact?.companyName ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      lineId: contact?.lineId ?? "",
      taxId: contact?.taxId ?? "",
      addressLine: contact?.addressLine ?? "",
      subdistrict: contact?.subdistrict ?? "",
      district: contact?.district ?? "",
      province: contact?.province ?? "",
      postalCode: contact?.postalCode ?? "",
      notes: contact?.notes ?? "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      if (contact) update.mutate({ id: contact.id, ...value })
      else create.mutate(value)
    },
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={contact ? `Edit ${contact.name}` : "New contact"}
      description="Prospects, buyers and co-buyers."
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
          <form.Field name="type">
            {(field) => (
              <SelectField
                field={field}
                label="Type"
                options={[
                  { value: "individual", label: "Individual" },
                  { value: "company", label: "Company" },
                ]}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.type}>
            {(type) =>
              type === "company" ? (
                <form.Field name="companyName">
                  {(field) => <TextField field={field} label="Company name" />}
                </form.Field>
              ) : (
                <FieldRow>
                  <form.Field name="firstName">{(field) => <TextField field={field} label="First name" />}</form.Field>
                  <form.Field name="lastName">{(field) => <TextField field={field} label="Last name" />}</form.Field>
                </FieldRow>
              )
            }
          </form.Subscribe>
          <FieldRow>
            <form.Field name="phone">
              {(field) => <TextField field={field} label="Phone" type="tel" placeholder="081-234-5678" />}
            </form.Field>
            <form.Field name="lineId">{(field) => <TextField field={field} label="LINE ID" />}</form.Field>
          </FieldRow>
          <form.Field name="email">{(field) => <TextField field={field} label="Email" type="email" />}</form.Field>
          <form.Field name="taxId">
            {(field) => (
              <TextField
                field={field}
                label="National ID / Tax ID"
                description="13 digits. Needed on contracts; only share with people who need it."
              />
            )}
          </form.Field>
          <form.Field name="addressLine">
            {(field) => <TextField field={field} label="Address" placeholder="House no., soi, road" />}
          </form.Field>
          <FieldRow>
            <form.Field name="subdistrict">{(field) => <TextField field={field} label="Subdistrict" />}</form.Field>
            <form.Field name="district">{(field) => <TextField field={field} label="District" />}</form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="province">{(field) => <TextField field={field} label="Province" />}</form.Field>
            <form.Field name="postalCode">{(field) => <TextField field={field} label="Postal code" />}</form.Field>
          </FieldRow>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
