"use client"

import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as z from "zod"

import { FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { labelize } from "@/lib/format"
import { optionalNumber, mutationCallbacks } from "@/lib/mutation"
import { type LeadRow, leadSources, leadStatuses } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const formSchema = z
  .object({
    contactMode: z.enum(["existing", "new"]),
    contactId: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
    email: z.union([z.email("Enter a valid email"), z.literal("")]),
    projectId: z.string(),
    interestedUnitTypeId: z.string(),
    assignedToId: z.string(),
    source: z.enum(leadSources),
    status: z.enum(leadStatuses),
    budgetMin: z.string(),
    budgetMax: z.string(),
    lostReason: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.contactMode === "existing" && !v.contactId) {
      ctx.addIssue({ code: "custom", path: ["contactId"], message: "Pick a contact" })
    }
    if (v.contactMode === "new" && !v.firstName.trim()) {
      ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" })
    }
    if (v.status === "lost" && !v.lostReason.trim()) {
      ctx.addIssue({ code: "custom", path: ["lostReason"], message: "Give a reason" })
    }
  })

const FORM_ID = "lead-form"

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: labelize(value) }))

export function LeadFormSheet({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lead: LeadRow | null
}) {
  const close = () => onOpenChange(false)
  const { data: options } = useQuery(trpc.sales.options.form.queryOptions(undefined, { enabled: open }))
  const create = useMutation(trpc.sales.leads.create.mutationOptions(mutationCallbacks("Lead created", close)))
  const update = useMutation(trpc.sales.leads.update.mutationOptions(mutationCallbacks("Lead updated", close)))

  const form = useForm({
    defaultValues: {
      contactMode: "existing",
      contactId: lead?.contactId ?? "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      projectId: lead?.projectId ?? "",
      interestedUnitTypeId: lead?.interestedUnitTypeId ?? "",
      assignedToId: lead?.assignedToId ?? "",
      source: lead?.source ?? "walk_in",
      status: lead?.status ?? "new",
      budgetMin: lead?.budgetMin ? String(Number(lead.budgetMin)) : "",
      budgetMax: lead?.budgetMax ? String(Number(lead.budgetMax)) : "",
      lostReason: lead?.lostReason ?? "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = {
        projectId: value.projectId || null,
        interestedUnitTypeId: value.interestedUnitTypeId || null,
        assignedToId: value.assignedToId || null,
        source: value.source,
        status: value.status,
        budgetMin: optionalNumber(value.budgetMin),
        budgetMax: optionalNumber(value.budgetMax),
        lostReason: value.lostReason || null,
      }
      if (lead) {
        update.mutate({ id: lead.id, ...fields })
        return
      }
      create.mutate({
        ...fields,
        ...(value.contactMode === "existing"
          ? { contactId: value.contactId }
          : {
              newContact: {
                type: "individual",
                firstName: value.firstName,
                lastName: value.lastName,
                phone: value.phone,
                email: value.email,
              },
            }),
      })
    },
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={lead ? `Edit lead – ${lead.contactName}` : "New lead"}
      description="A contact's interest in one of your projects."
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
          {lead ? (
            <p className="text-xs">
              Contact: <span className="font-medium">{lead.contactName}</span>
            </p>
          ) : (
            <>
              <form.Field name="contactMode">
                {(field) => (
                  <SelectField
                    field={field}
                    label="Contact"
                    options={[
                      { value: "existing", label: "Existing contact" },
                      { value: "new", label: "New contact" },
                    ]}
                  />
                )}
              </form.Field>
              <form.Subscribe selector={(s) => s.values.contactMode}>
                {(mode) =>
                  mode === "existing" ? (
                    <form.Field name="contactId">
                      {(field) => (
                        <SelectField
                          field={field}
                          label="Pick contact"
                          options={(options?.contacts ?? []).map((c) => ({
                            value: c.id,
                            label: c.phone ? `${c.name} · ${c.phone}` : c.name,
                          }))}
                        />
                      )}
                    </form.Field>
                  ) : (
                    <>
                      <FieldRow>
                        <form.Field name="firstName">
                          {(field) => <TextField field={field} label="First name" />}
                        </form.Field>
                        <form.Field name="lastName">
                          {(field) => <TextField field={field} label="Last name" />}
                        </form.Field>
                      </FieldRow>
                      <FieldRow>
                        <form.Field name="phone">
                          {(field) => <TextField field={field} label="Phone" type="tel" />}
                        </form.Field>
                        <form.Field name="email">
                          {(field) => <TextField field={field} label="Email" type="email" />}
                        </form.Field>
                      </FieldRow>
                    </>
                  )
                }
              </form.Subscribe>
              <FieldSeparator />
            </>
          )}

          <form.Field name="projectId" listeners={{ onChange: () => form.setFieldValue("interestedUnitTypeId", "") }}>
            {(field) => (
              <SelectField
                field={field}
                label="Project"
                emptyLabel="Not decided"
                options={(options?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.projectId}>
            {(projectId) => (
              <form.Field name="interestedUnitTypeId">
                {(field) => (
                  <SelectField
                    field={field}
                    label="Interested in"
                    emptyLabel="Any unit type"
                    disabled={!projectId}
                    options={(options?.unitTypes ?? [])
                      .filter((t) => t.projectId === projectId)
                      .map((t) => ({ value: t.id, label: t.name }))}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
          <FieldRow>
            <form.Field name="budgetMin">{(field) => <MoneyField field={field} label="Budget from (฿)" />}</form.Field>
            <form.Field name="budgetMax">{(field) => <MoneyField field={field} label="Budget to (฿)" />}</form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="source">
              {(field) => <SelectField field={field} label="Source" options={toOptions(leadSources)} />}
            </form.Field>
            <form.Field name="status">
              {(field) => <SelectField field={field} label="Status" options={toOptions(leadStatuses)} />}
            </form.Field>
          </FieldRow>
          <form.Subscribe selector={(s) => s.values.status}>
            {(status) =>
              status === "lost" && (
                <form.Field name="lostReason">
                  {(field) => <TextareaField field={field} label="Why was it lost?" />}
                </form.Field>
              )
            }
          </form.Subscribe>
          <form.Field name="assignedToId">
            {(field) => (
              <SelectField
                field={field}
                label="Assigned to"
                emptyLabel="Unassigned"
                options={(options?.members ?? []).map((m) => ({ value: m.id, label: m.name }))}
              />
            )}
          </form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
