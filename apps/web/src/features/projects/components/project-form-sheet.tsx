"use client"

import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import * as z from "zod"

import { DateField, FieldRow, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { type ProjectDetail, projectStatuses, projectTypes } from "@/features/projects/types"
import { labelize } from "@/lib/format"
import { mutationCallbacks, optionalNumber } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  name: z.string().trim().min(1, "Name is required").max(200),
  type: z.enum(projectTypes),
  status: z.enum(projectStatuses),
  description: z.string().max(2000),
  addressLine: z.string(),
  subdistrict: z.string(),
  district: z.string(),
  province: z.string(),
  postalCode: z.string(),
  landAreaSqw: z.string(),
  launchDate: z.union([z.iso.date(), z.literal("")]),
  expectedCompletionDate: z.union([z.iso.date(), z.literal("")]),
})

const FORM_ID = "project-form"
const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: labelize(value) }))

/** New project (owner), or edit one (`project` set; admin, manager, owner). */
export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectDetail | null
}) {
  const router = useRouter()
  const close = () => onOpenChange(false)
  const create = useMutation(trpc.projects.projects.create.mutationOptions(mutationCallbacks("Project created", close)))
  const update = useMutation(trpc.projects.projects.update.mutationOptions(mutationCallbacks("Project updated", close)))

  const form = useForm({
    defaultValues: {
      code: project?.code ?? "",
      name: project?.name ?? "",
      type: project?.type ?? "condominium",
      status: project?.status ?? "planning",
      description: project?.description ?? "",
      addressLine: project?.addressLine ?? "",
      subdistrict: project?.subdistrict ?? "",
      district: project?.district ?? "",
      province: project?.province ?? "",
      postalCode: project?.postalCode ?? "",
      landAreaSqw: project?.landAreaSqw ? String(Number(project.landAreaSqw)) : "",
      launchDate: project?.launchDate ?? "",
      expectedCompletionDate: project?.expectedCompletionDate ?? "",
    } as z.input<typeof formSchema>,
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const input = {
        ...value,
        landAreaSqw: optionalNumber(value.landAreaSqw),
        launchDate: value.launchDate || null,
        expectedCompletionDate: value.expectedCompletionDate || null,
      }
      if (project) update.mutate({ id: project.id, ...input })
      // Open the new project so phases, unit types and units can be added
      else create.mutate(input, { onSuccess: (data) => router.push(`/projects/all/${data.id}`) })
    },
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={project ? `Edit ${project.name}` : "New project"}
      description="A development you build and sell: a condo, a housing estate, townhouses…"
      formId={FORM_ID}
      submitLabel={project ? "Save" : "Create project"}
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
            <form.Field name="code">
              {(field) => <TextField field={field} label="Code" placeholder="RSC" description="Short, unique" />}
            </form.Field>
            <form.Field name="type">
              {(field) => <SelectField field={field} label="Type" options={toOptions(projectTypes)} />}
            </form.Field>
          </FieldRow>
          <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
          <form.Field name="status">
            {(field) => <SelectField field={field} label="Status" options={toOptions(projectStatuses)} />}
          </form.Field>
          <form.Field name="description">{(field) => <TextareaField field={field} label="Description" />}</form.Field>
          <FieldRow>
            <form.Field name="launchDate">{(field) => <DateField field={field} label="Launch date" />}</form.Field>
            <form.Field name="expectedCompletionDate">
              {(field) => <DateField field={field} label="Expected completion" />}
            </form.Field>
          </FieldRow>
          <form.Field name="landAreaSqw">
            {(field) => <TextField field={field} label="Land area (sq. wah)" type="number" />}
          </form.Field>
          <FieldSeparator />
          <form.Field name="addressLine">
            {(field) => <TextField field={field} label="Address" placeholder="Plot no., road" />}
          </form.Field>
          <FieldRow>
            <form.Field name="subdistrict">{(field) => <TextField field={field} label="Subdistrict" />}</form.Field>
            <form.Field name="district">{(field) => <TextField field={field} label="District" />}</form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="province">{(field) => <TextField field={field} label="Province" />}</form.Field>
            <form.Field name="postalCode">{(field) => <TextField field={field} label="Postal code" />}</form.Field>
          </FieldRow>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}
