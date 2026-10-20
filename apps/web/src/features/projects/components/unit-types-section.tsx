"use client"

import { FieldGroup } from "@real-estate-management/ui/components/field"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as z from "zod"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import { actionsColumn, type Column, DataTable, HeaderButton, Stacked } from "@/components/list/list-layout"
import type { UnitTypeRow } from "@/features/projects/types"
import { useProjectPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { formatMoney } from "@/lib/format"
import { mutationCallbacks, optionalNumber } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const formSchema = z.object({
  projectId: z.string().min(1, "Pick a project"),
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(1, "Name is required").max(100),
  bedrooms: z.string(),
  bathrooms: z.string(),
  parkingSpaces: z.string(),
  usableAreaSqm: z.string(),
  landAreaSqw: z.string(),
  basePrice: z.string(),
  description: z.string(),
})

const FORM_ID = "unit-type-form"
const asString = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)))

function UnitTypeFormSheet({
  open,
  onOpenChange,
  unitType,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unitType: UnitTypeRow | null
  /** Fixed project (project page); otherwise the form asks for one. */
  projectId?: string
}) {
  const close = () => onOpenChange(false)
  const { data: projects } = useQuery(
    trpc.projects.projects.options.queryOptions(undefined, { enabled: open && !projectId }),
  )
  const create = useMutation(
    trpc.projects.unitTypes.create.mutationOptions(mutationCallbacks("Unit type added", close)),
  )
  const update = useMutation(
    trpc.projects.unitTypes.update.mutationOptions(mutationCallbacks("Unit type updated", close)),
  )

  const form = useForm({
    defaultValues: {
      projectId: unitType?.projectId ?? projectId ?? "",
      code: unitType?.code ?? "",
      name: unitType?.name ?? "",
      bedrooms: asString(unitType?.bedrooms),
      bathrooms: asString(unitType?.bathrooms),
      parkingSpaces: asString(unitType?.parkingSpaces),
      usableAreaSqm: asString(unitType?.usableAreaSqm),
      landAreaSqw: asString(unitType?.landAreaSqw),
      basePrice: asString(unitType?.basePrice),
      description: unitType?.description ?? "",
    },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      const fields = {
        code: value.code,
        name: value.name,
        bedrooms: optionalNumber(value.bedrooms),
        bathrooms: optionalNumber(value.bathrooms),
        parkingSpaces: optionalNumber(value.parkingSpaces),
        usableAreaSqm: optionalNumber(value.usableAreaSqm),
        landAreaSqw: optionalNumber(value.landAreaSqw),
        basePrice: optionalNumber(value.basePrice),
        description: value.description,
      }
      if (unitType) update.mutate({ id: unitType.id, ...fields })
      else create.mutate({ projectId: value.projectId, ...fields })
    },
  })

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={unitType ? `Edit ${unitType.name}` : "New unit type"}
      description="A house model or floor plan. Units of this type start with its area and base price."
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
          {!projectId && !unitType && (
            <form.Field name="projectId">
              {(field) => (
                <SelectField
                  field={field}
                  label="Project"
                  options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              )}
            </form.Field>
          )}
          <FieldRow>
            <form.Field name="code">{(field) => <TextField field={field} label="Code" placeholder="2BR" />}</form.Field>
            <form.Field name="name">
              {(field) => <TextField field={field} label="Name" placeholder="2 Bedroom" />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="bedrooms">
              {(field) => <TextField field={field} label="Bedrooms" type="number" />}
            </form.Field>
            <form.Field name="bathrooms">
              {(field) => <TextField field={field} label="Bathrooms" type="number" />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="parkingSpaces">
              {(field) => <TextField field={field} label="Parking spaces" type="number" />}
            </form.Field>
            <form.Field name="usableAreaSqm">
              {(field) => <TextField field={field} label="Usable area (m²)" type="number" />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="landAreaSqw">
              {(field) => (
                <TextField field={field} label="Land (sq. wah)" type="number" description="Leave empty for condos" />
              )}
            </form.Field>
            <form.Field name="basePrice">{(field) => <MoneyField field={field} label="Base price (฿)" />}</form.Field>
          </FieldRow>
          <form.Field name="description">{(field) => <TextareaField field={field} label="Description" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}

/** Unit types of one project (project page) or of all projects (Unit types page). */
export function UnitTypesSection({ projectId, showAddButton = true }: { projectId?: string; showAddButton?: boolean }) {
  const { canUpdate, canDelete } = useProjectPermissions()
  const { data } = useQuery(trpc.projects.unitTypes.list.queryOptions({ projectId }))
  const sheet = useDialogState<UnitTypeRow>()
  const confirmDelete = useDialogState<UnitTypeRow>()
  const remove = useMutation(
    trpc.projects.unitTypes.delete.mutationOptions(mutationCallbacks("Unit type deleted", confirmDelete.close)),
  )

  const columns: Column<UnitTypeRow>[] = [
    { header: "Type", cell: (r) => <Stacked primary={r.name} secondary={r.code} /> },
    ...(projectId ? [] : [{ header: "Project", cell: (r: UnitTypeRow) => r.projectName }]),
    {
      header: "Layout",
      cell: (r) =>
        [
          r.bedrooms != null && `${r.bedrooms} bed`,
          r.bathrooms != null && `${r.bathrooms} bath`,
          r.parkingSpaces && `${r.parkingSpaces} parking`,
        ]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    {
      header: "Area",
      cell: (r) => (
        <Stacked
          primary={r.usableAreaSqm ? `${Number(r.usableAreaSqm)} m²` : "—"}
          secondary={r.landAreaSqw && `${Number(r.landAreaSqw)} sq. wah land`}
        />
      ),
    },
    { header: "Base price", cell: (r) => formatMoney(r.basePrice), className: "text-right tabular-nums" },
    { header: "Units", cell: (r) => r.unitCount, className: "text-right tabular-nums" },
    actionsColumn<UnitTypeRow>((r) => [
      { label: "Edit", onClick: () => sheet.show(r), hidden: !canUpdate },
      { label: "Delete", onClick: () => confirmDelete.show(r), destructive: true, hidden: !canDelete },
    ]),
  ]

  return (
    <div className="flex flex-col gap-3">
      {showAddButton && canUpdate && (
        <div className="flex justify-end">
          <HeaderButton label="New unit type" onClick={() => sheet.show(null)} />
        </div>
      )}
      <DataTable columns={columns} rows={data} emptyMessage="No unit types yet." />
      <UnitTypeFormSheet
        key={sheet.key}
        open={sheet.open}
        onOpenChange={sheet.setOpen}
        unitType={sheet.value}
        projectId={projectId}
      />
      <ConfirmActionDialog
        key={`delete-${confirmDelete.key}`}
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title={`Delete ${confirmDelete.value?.name ?? "unit type"}?`}
        description="Only possible while no unit uses it."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirmDelete.value && remove.mutate({ id: confirmDelete.value.id })}
      />
    </div>
  )
}
