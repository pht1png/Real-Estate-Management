"use client"

import { Button } from "@real-estate-management/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@real-estate-management/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@real-estate-management/ui/components/dialog"
import { Field, FieldLabel } from "@real-estate-management/ui/components/field"
import { Input } from "@real-estate-management/ui/components/input"
import { Skeleton } from "@real-estate-management/ui/components/skeleton"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { useBreadcrumbLabel } from "@/components/breadcrumb-label"
import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { RowActions } from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import { ProjectFormSheet } from "@/features/projects/components/project-form-sheet"
import { UnitTypesSection } from "@/features/projects/components/unit-types-section"
import { UnitsSection } from "@/features/projects/components/units-section"
import type { PhaseRow, ProjectDetail as Detail } from "@/features/projects/types"
import { useProjectPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { formatDate, labelize } from "@/lib/format"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{children || "—"}</span>
    </div>
  )
}

function PhaseDialog({
  open,
  onOpenChange,
  projectId,
  phase,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  phase: PhaseRow | null
}) {
  const [name, setName] = useState(phase?.name ?? "")
  const [startDate, setStartDate] = useState(phase?.startDate ?? "")
  const [endDate, setEndDate] = useState(phase?.endDate ?? "")
  const close = () => onOpenChange(false)
  const create = useMutation(trpc.projects.phases.create.mutationOptions(mutationCallbacks("Phase added", close)))
  const update = useMutation(trpc.projects.phases.update.mutationOptions(mutationCallbacks("Phase updated", close)))
  const save = () => {
    const fields = { name: name.trim(), startDate: startDate || null, endDate: endDate || null }
    if (phase) update.mutate({ id: phase.id, ...fields })
    else create.mutate({ projectId, ...fields })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{phase ? `Edit ${phase.name}` : "New phase"}</DialogTitle>
          <DialogDescription>A phase, zone or building, e.g. "Phase 1" or "Building A".</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="phase-name">Name</FieldLabel>
          <Input id="phase-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="phase-start">Start</FieldLabel>
            <Input id="phase-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="phase-end">End</FieldLabel>
            <Input id="phase-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || create.isPending || update.isPending} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PhasesCard({ project, canUpdate }: { project: Detail; canUpdate: boolean }) {
  const dialog = useDialogState<PhaseRow>()
  const confirmDelete = useDialogState<PhaseRow>()
  const remove = useMutation(
    trpc.projects.phases.delete.mutationOptions(mutationCallbacks("Phase deleted", confirmDelete.close)),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phases</CardTitle>
        <CardDescription>Phases, zones or buildings</CardDescription>
        {canUpdate && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => dialog.show(null)}>
              Add phase
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {project.phases.length === 0 && <p className="text-muted-foreground">No phases yet.</p>}
        {project.phases.map((phase) => (
          <div key={phase.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0">
            <div className="flex flex-col">
              <span className="font-medium">{phase.name}</span>
              <span className="text-muted-foreground">
                {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
              </span>
            </div>
            <RowActions
              actions={[
                { label: "Edit", onClick: () => dialog.show(phase), hidden: !canUpdate },
                { label: "Delete", onClick: () => confirmDelete.show(phase), destructive: true, hidden: !canUpdate },
              ]}
            />
          </div>
        ))}
      </CardContent>
      <PhaseDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        projectId={project.id}
        phase={dialog.value}
      />
      <ConfirmActionDialog
        key={`delete-${confirmDelete.key}`}
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title={`Delete ${confirmDelete.value?.name ?? "phase"}?`}
        description="Its units stay in the project, without a phase."
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirmDelete.value && remove.mutate({ id: confirmDelete.value.id })}
      />
    </Card>
  )
}

export function ProjectDetail({ id }: { id: string }) {
  const router = useRouter()
  const { data: project, error } = useQuery(trpc.projects.projects.get.queryOptions({ id }))
  const { canUpdate, canDelete } = useProjectPermissions()
  const editSheet = useDialogState<null>()
  const confirmDelete = useDialogState<null>()
  const remove = useMutation(
    trpc.projects.projects.delete.mutationOptions({
      ...mutationCallbacks("Project deleted", confirmDelete.close),
    }),
  )
  useBreadcrumbLabel(project?.name)

  if (error) return <p className="text-xs">{error.message}</p>
  if (!project) return <Skeleton className="h-96 w-full" />

  const address = [project.addressLine, project.subdistrict, project.district, project.province, project.postalCode]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {project.code} · {labelize(project.type)} · {project.units.total} units ({project.units.available}{" "}
            available, {project.units.reserved} reserved, {project.units.sold} sold)
          </p>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <Button variant="outline" onClick={() => editSheet.show(null)}>
              Edit
            </Button>
          )}
          {canDelete && (
            <Button variant="destructive" onClick={() => confirmDelete.show(null)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="Type">{labelize(project.type)}</Info>
            <Info label="Launch">{formatDate(project.launchDate)}</Info>
            <Info label="Expected completion">{formatDate(project.expectedCompletionDate)}</Info>
            <Info label="Land area">
              {project.landAreaSqw && `${Number(project.landAreaSqw).toLocaleString()} sq. wah`}
            </Info>
            <div className="col-span-2">
              <Info label="Address">{address}</Info>
            </div>
            {project.description && (
              <div className="col-span-full">
                <Info label="Description">{project.description}</Info>
              </div>
            )}
          </CardContent>
        </Card>
        <PhasesCard project={project} canUpdate={canUpdate} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Unit types</h2>
        <UnitTypesSection projectId={project.id} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Units</h2>
        <UnitsSection projectId={project.id} />
      </section>

      <ProjectFormSheet key={editSheet.key} open={editSheet.open} onOpenChange={editSheet.setOpen} project={project} />
      <ConfirmActionDialog
        key={`delete-${confirmDelete.key}`}
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title={`Delete ${project.name}?`}
        description="Only possible for a project with no units, leads, budget or purchases yet. Otherwise set its status to Cancelled."
        confirmLabel="Delete project"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate({ id: project.id }, { onSuccess: () => router.push("/projects/all") })}
      />
    </div>
  )
}
