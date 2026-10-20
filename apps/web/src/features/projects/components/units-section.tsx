"use client"

import { canChangeUnitStatus, generateUnitNumbers, type UnitNumberPattern } from "@real-estate-management/api/lib/units"
import { FieldGroup, FieldSeparator } from "@real-estate-management/ui/components/field"
import { useForm, useStore } from "@tanstack/react-form"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import * as z from "zod"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { FieldRow, MoneyField, SelectField, TextareaField, TextField } from "@/components/forms/form-fields"
import { FormSheet } from "@/components/forms/form-sheet"
import {
  actionsColumn,
  type Column,
  DataTable,
  FilterSelect,
  HeaderButton,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import { type UnitRow, type UnitStatus, unitStatuses } from "@/features/projects/types"
import { useProjectPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatMoney, labelize } from "@/lib/format"
import { mutationCallbacks, optionalNumber } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const asString = (v: string | number | null | undefined) => (v == null ? "" : String(Number(v)))

/** Phases and unit types of a project, for the unit forms. */
function useProjectParts(projectId: string | undefined, enabled: boolean) {
  const { data } = useQuery(
    trpc.projects.projects.get.queryOptions({ id: projectId ?? "" }, { enabled: enabled && Boolean(projectId) }),
  )
  return {
    phases: (data?.phases ?? []).map((p) => ({ value: p.id, label: p.name })),
    unitTypes: data?.unitTypes ?? [],
  }
}

// ─── Single unit ────────────────────────────────────────────────────────────

const unitSchema = z.object({
  projectId: z.string().min(1, "Pick a project"),
  unitNumber: z.string().trim().min(1, "Unit number is required").max(30),
  houseNumber: z.string(),
  phaseId: z.string(),
  unitTypeId: z.string(),
  floor: z.string(),
  facing: z.string(),
  usableAreaSqm: z.string(),
  landAreaSqw: z.string(),
  listPrice: z.string().refine((v) => v !== "" && Number(v) >= 0, "Enter the list price"),
  titleDeedNumber: z.string(),
  notes: z.string(),
})

function UnitFormSheet({
  open,
  onOpenChange,
  unit,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit: UnitRow | null
  projectId?: string
}) {
  const close = () => onOpenChange(false)
  const { data: projects } = useQuery(
    trpc.projects.projects.options.queryOptions(undefined, { enabled: open && !projectId && !unit }),
  )
  const create = useMutation(trpc.projects.units.create.mutationOptions(mutationCallbacks("Unit added", close)))
  const update = useMutation(trpc.projects.units.update.mutationOptions(mutationCallbacks("Unit updated", close)))

  const form = useForm({
    defaultValues: {
      projectId: unit?.projectId ?? projectId ?? "",
      unitNumber: unit?.unitNumber ?? "",
      houseNumber: unit?.houseNumber ?? "",
      phaseId: unit?.phaseId ?? "",
      unitTypeId: unit?.unitTypeId ?? "",
      floor: asString(unit?.floor),
      facing: unit?.facing ?? "",
      usableAreaSqm: asString(unit?.usableAreaSqm),
      landAreaSqw: asString(unit?.landAreaSqw),
      listPrice: asString(unit?.listPrice),
      titleDeedNumber: unit?.titleDeedNumber ?? "",
      notes: unit?.notes ?? "",
    },
    validators: { onSubmit: unitSchema },
    onSubmit: ({ value }) => {
      const fields = {
        unitNumber: value.unitNumber,
        houseNumber: value.houseNumber,
        phaseId: value.phaseId || null,
        unitTypeId: value.unitTypeId || null,
        floor: optionalNumber(value.floor),
        facing: value.facing,
        usableAreaSqm: optionalNumber(value.usableAreaSqm),
        landAreaSqw: optionalNumber(value.landAreaSqw),
        listPrice: Number(value.listPrice),
        titleDeedNumber: value.titleDeedNumber,
        notes: value.notes,
      }
      if (unit) update.mutate({ id: unit.id, ...fields })
      else create.mutate({ projectId: value.projectId, ...fields })
    },
  })

  const selectedProject = useStore(form.store, (s) => s.values.projectId)
  const parts = useProjectParts(selectedProject, open)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={unit ? `Edit unit ${unit.unitNumber}` : "New unit"}
      description="Status is changed from the unit's menu; reserved and sold units are managed by sales."
      formId="unit-form"
      pending={create.isPending || update.isPending}
    >
      <form
        id="unit-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          {!projectId && !unit && (
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
            <form.Field name="unitNumber">
              {(field) => <TextField field={field} label="Unit number" placeholder="A-301" />}
            </form.Field>
            <form.Field name="houseNumber">
              {(field) => <TextField field={field} label="House no. (บ้านเลขที่)" description="Once assigned" />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field
              name="unitTypeId"
              listeners={{
                // Pre-fill area and price from the unit type, without overwriting what's typed
                onChange: ({ value }) => {
                  const type = parts.unitTypes.find((t) => t.id === value)
                  if (!type) return
                  if (!form.getFieldValue("usableAreaSqm"))
                    form.setFieldValue("usableAreaSqm", asString(type.usableAreaSqm))
                  if (!form.getFieldValue("landAreaSqw")) form.setFieldValue("landAreaSqw", asString(type.landAreaSqw))
                  if (!form.getFieldValue("listPrice")) form.setFieldValue("listPrice", asString(type.basePrice))
                },
              }}
            >
              {(field) => (
                <SelectField
                  field={field}
                  label="Unit type"
                  emptyLabel="None"
                  options={parts.unitTypes.map((t) => ({ value: t.id, label: `${t.code} · ${t.name}` }))}
                />
              )}
            </form.Field>
            <form.Field name="phaseId">
              {(field) => <SelectField field={field} label="Phase" emptyLabel="None" options={parts.phases} />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="floor">{(field) => <TextField field={field} label="Floor" type="number" />}</form.Field>
            <form.Field name="facing">
              {(field) => <TextField field={field} label="Facing" placeholder="North, river view…" />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="usableAreaSqm">
              {(field) => <TextField field={field} label="Usable area (m²)" type="number" />}
            </form.Field>
            <form.Field name="landAreaSqw">
              {(field) => <TextField field={field} label="Land (sq. wah)" type="number" />}
            </form.Field>
          </FieldRow>
          <form.Field name="listPrice">{(field) => <MoneyField field={field} label="List price (฿)" />}</form.Field>
          <form.Field name="titleDeedNumber">
            {(field) => <TextField field={field} label="Title deed no. (โฉนด / อ.ช.2)" />}
          </form.Field>
          <form.Field name="notes">{(field) => <TextareaField field={field} label="Notes" />}</form.Field>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}

// ─── Bulk generator ─────────────────────────────────────────────────────────

const toPattern = (v: Record<string, string>): UnitNumberPattern =>
  v.kind === "floors"
    ? {
        kind: "floors",
        prefix: v.prefix ?? "",
        floorFrom: Number(v.floorFrom),
        floorTo: Number(v.floorTo),
        roomsPerFloor: Number(v.roomsPerFloor),
      }
    : { kind: "sequence", prefix: v.prefix ?? "", from: Number(v.from), to: Number(v.to), pad: Number(v.pad) }

function GenerateUnitsSheet({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}) {
  const parts = useProjectParts(projectId, open)
  const generate = useMutation(
    trpc.projects.units.bulkCreate.mutationOptions(mutationCallbacks("Units created", () => onOpenChange(false))),
  )

  const form = useForm({
    defaultValues: {
      kind: "floors",
      prefix: "A-",
      floorFrom: "2",
      floorTo: "8",
      roomsPerFloor: "4",
      from: "1",
      to: "12",
      pad: "2",
      unitTypeId: "",
      phaseId: "",
      listPrice: "",
      facing: "",
    },
    onSubmit: ({ value }) => {
      generate.mutate({
        projectId,
        pattern: toPattern(value),
        unitTypeId: value.unitTypeId || null,
        phaseId: value.phaseId || null,
        listPrice: optionalNumber(value.listPrice),
        facing: value.facing,
      })
    },
  })

  const values = useStore(form.store, (s) => s.values)
  const preview = generateUnitNumbers(toPattern(values))
  const numbers = preview.units.map((u) => u.unitNumber)
  const type = parts.unitTypes.find((t) => t.id === values.unitTypeId)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Generate units"
      description="Create many units at once from a numbering pattern. Nothing is created if any number already exists."
      formId="generate-units-form"
      submitLabel={preview.error ? "Generate" : `Create ${numbers.length} units`}
      pending={generate.isPending}
    >
      <form
        id="generate-units-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!preview.error) form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="kind">
            {(field) => (
              <SelectField
                field={field}
                label="Numbering"
                options={[
                  { value: "floors", label: "Floor + room (A-201, A-202…)" },
                  { value: "sequence", label: "Running number (P1-01, P1-02…)" },
                ]}
              />
            )}
          </form.Field>
          <form.Field name="prefix">
            {(field) => (
              <TextField
                field={field}
                label="Prefix"
                placeholder="A-"
                description="Building or phase, e.g. A- or P1-"
              />
            )}
          </form.Field>
          {values.kind === "floors" ? (
            <>
              <FieldRow>
                <form.Field name="floorFrom">
                  {(field) => <TextField field={field} label="From floor" type="number" />}
                </form.Field>
                <form.Field name="floorTo">
                  {(field) => <TextField field={field} label="To floor" type="number" />}
                </form.Field>
              </FieldRow>
              <form.Field name="roomsPerFloor">
                {(field) => <TextField field={field} label="Rooms per floor" type="number" />}
              </form.Field>
            </>
          ) : (
            <FieldRow>
              <form.Field name="from">{(field) => <TextField field={field} label="From" type="number" />}</form.Field>
              <form.Field name="to">{(field) => <TextField field={field} label="To" type="number" />}</form.Field>
              <form.Field name="pad">
                {(field) => <TextField field={field} label="Digits" type="number" description="2 → 01, 02…" />}
              </form.Field>
            </FieldRow>
          )}
          <FieldSeparator />
          <FieldRow>
            <form.Field name="unitTypeId">
              {(field) => (
                <SelectField
                  field={field}
                  label="Unit type"
                  emptyLabel="None"
                  options={parts.unitTypes.map((t) => ({ value: t.id, label: `${t.code} · ${t.name}` }))}
                />
              )}
            </form.Field>
            <form.Field name="phaseId">
              {(field) => <SelectField field={field} label="Phase" emptyLabel="None" options={parts.phases} />}
            </form.Field>
          </FieldRow>
          <FieldRow>
            <form.Field name="listPrice">
              {(field) => (
                <MoneyField
                  field={field}
                  label="List price (฿)"
                  placeholder={type?.basePrice ? String(Number(type.basePrice)) : "0"}
                  description={type?.basePrice ? "Empty = the unit type's base price" : undefined}
                />
              )}
            </form.Field>
            <form.Field name="facing">{(field) => <TextField field={field} label="Facing" />}</form.Field>
          </FieldRow>
          <FieldSeparator />
          <div className="flex flex-col gap-2 text-xs">
            <span className="font-medium">Preview</span>
            {preview.error ? (
              <span className="text-destructive">{preview.error}</span>
            ) : (
              <span className="text-muted-foreground">
                {numbers.length} units: {numbers.slice(0, 12).join(", ")}
                {numbers.length > 12 && ` … ${numbers.at(-1)}`}
              </span>
            )}
          </div>
        </FieldGroup>
      </form>
    </FormSheet>
  )
}

// ─── Units table ────────────────────────────────────────────────────────────

const manualStatuses = ["available", "on_hold", "unavailable"] as const

/** Units of one project (project page) or of all projects (Units page, with a project filter). */
export function UnitsSection({ projectId }: { projectId?: string }) {
  const list = useListState<UnitStatus>()
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const { canUpdate, canDelete } = useProjectPermissions()
  const sheet = useDialogState<UnitRow>()
  const generator = useDialogState<null>()
  const confirmDelete = useDialogState<UnitRow>()
  const setStatus = useMutation(trpc.projects.units.setStatus.mutationOptions(mutationCallbacks("Status updated")))
  const remove = useMutation(
    trpc.projects.units.delete.mutationOptions(mutationCallbacks("Unit deleted", confirmDelete.close)),
  )

  const { data: projects } = useQuery(trpc.projects.projects.options.queryOptions(undefined, { enabled: !projectId }))
  const scopeProject = projectId ?? projectFilter ?? undefined
  const { data } = useQuery(
    trpc.projects.units.list.queryOptions(
      { ...list.query, projectId: scopeProject, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: UnitStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  const columns: Column<UnitRow>[] = [
    {
      header: "Unit",
      cell: (r) => <Stacked primary={r.unitNumber} secondary={r.houseNumber && `บ้านเลขที่ ${r.houseNumber}`} />,
    },
    ...(projectId ? [] : [{ header: "Project", cell: (r: UnitRow) => r.projectName }]),
    { header: "Type", cell: (r) => <Stacked primary={r.unitTypeName ?? "—"} secondary={r.phaseName} /> },
    {
      header: "Floor / facing",
      cell: (r) => <Stacked primary={r.floor != null ? `Floor ${r.floor}` : "—"} secondary={r.facing} />,
    },
    {
      header: "Area",
      cell: (r) => (
        <Stacked
          primary={r.usableAreaSqm ? `${Number(r.usableAreaSqm)} m²` : "—"}
          secondary={r.landAreaSqw && `${Number(r.landAreaSqw)} sq. wah`}
        />
      ),
    },
    { header: "List price", cell: (r) => formatMoney(r.listPrice), className: "text-right tabular-nums" },
    { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    actionsColumn<UnitRow>((r) => [
      { label: "Edit", onClick: () => sheet.show(r), hidden: !canUpdate },
      ...manualStatuses.map((status) => ({
        label: `Mark ${labelize(status).toLowerCase()}`,
        onClick: () => setStatus.mutate({ id: r.id, status }),
        hidden: !canUpdate || !canChangeUnitStatus(r.status, status),
      })),
      { label: "Delete", onClick: () => confirmDelete.show(r), destructive: true, hidden: !canDelete },
    ]),
  ]

  return (
    <div className="flex flex-col gap-3">
      <StatCards
        stats={unitStatuses.map((status) => ({
          label: labelize(status),
          value: data ? countFor(status) : "–",
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search unit, house or deed no." />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={unitStatuses} allLabel="All statuses" />
        {!projectId && (
          <FilterSelect
            value={projectFilter}
            onChange={(v) => {
              setProjectFilter(v)
              list.setPage(1)
            }}
            options={(projects ?? []).map((p) => p.id)}
            labelFor={(id) => projects?.find((p) => p.id === id)?.name ?? id}
            allLabel="All projects"
          />
        )}
        {canUpdate && (
          <div className="flex gap-2 sm:ml-auto">
            {projectId && <HeaderButton label="Generate units" onClick={() => generator.show(null)} />}
            <HeaderButton label="New unit" onClick={() => sheet.show(null)} />
          </div>
        )}
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No units match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <UnitFormSheet
        key={sheet.key}
        open={sheet.open}
        onOpenChange={sheet.setOpen}
        unit={sheet.value}
        projectId={projectId}
      />
      {projectId && (
        <GenerateUnitsSheet
          key={`generate-${generator.key}`}
          open={generator.open}
          onOpenChange={generator.setOpen}
          projectId={projectId}
        />
      )}
      <ConfirmActionDialog
        key={`delete-${confirmDelete.key}`}
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title={`Delete unit ${confirmDelete.value?.unitNumber ?? ""}?`}
        description="Only possible for units with no sales or defect records. Otherwise mark it unavailable."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirmDelete.value && remove.mutate({ id: confirmDelete.value.id })}
      />
    </div>
  )
}
