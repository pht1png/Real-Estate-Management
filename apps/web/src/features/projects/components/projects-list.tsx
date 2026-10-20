"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import Link from "next/link"

import {
  type Column,
  DataTable,
  FilterSelect,
  HeaderButton,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  StatCards,
  Toolbar,
} from "@/components/list/list-layout"
import { StatusBadge } from "@/components/list/status-badge"
import { ProjectFormSheet } from "@/features/projects/components/project-form-sheet"
import { type ProjectRow, type ProjectStatus, projectStatuses } from "@/features/projects/types"
import { useProjectPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, labelize } from "@/lib/format"
import { trpc } from "@/utils/trpc"

/** "26 of 40 available" with a bar split by available / reserved / sold. */
function UnitsCell({ units }: { units: ProjectRow["units"] }) {
  if (!units.total) return <span className="text-muted-foreground">No units yet</span>
  const pct = (n: number) => `${(n / units.total) * 100}%`
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <span className="tabular-nums">
        {units.available} of {units.total} available
      </span>
      <div className="flex h-1 w-full bg-muted" aria-hidden>
        <div className="h-full bg-primary/40" style={{ width: pct(units.available) }} />
        <div className="h-full bg-primary/70" style={{ width: pct(units.reserved) }} />
        <div className="h-full bg-primary" style={{ width: pct(units.sold) }} />
      </div>
      <span className="text-muted-foreground tabular-nums">
        {units.reserved} reserved · {units.sold} sold
      </span>
    </div>
  )
}

const columns: Column<ProjectRow>[] = [
  {
    header: "Project",
    cell: (r) => (
      <Link href={`/projects/all/${r.id}`} className="flex flex-col underline-offset-4 hover:underline">
        <span className="font-medium">{r.name}</span>
        <span className="text-muted-foreground">{r.code}</span>
      </Link>
    ),
  },
  { header: "Type", cell: (r) => labelize(r.type) },
  { header: "Location", cell: (r) => <Stacked primary={r.district ?? "—"} secondary={r.province} /> },
  { header: "Units", cell: (r) => <UnitsCell units={r.units} /> },
  {
    header: "Timeline",
    cell: (r) => (
      <Stacked
        primary={`Launch ${formatDate(r.launchDate)}`}
        secondary={`Done ${formatDate(r.expectedCompletionDate)}`}
      />
    ),
  },
  { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
]

export function ProjectsList() {
  const list = useListState<ProjectStatus>()
  const { canCreate } = useProjectPermissions()
  const sheet = useDialogState<null>()
  const { data } = useQuery(
    trpc.projects.projects.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const countFor = (status: ProjectStatus) => data?.statusCounts.find((c) => c.status === status)?.count ?? 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Projects"
        description="Every development, with its units and how many are still available."
        action={canCreate && <HeaderButton label="New project" onClick={() => sheet.show(null)} />}
      />
      <StatCards
        stats={projectStatuses.map((status) => ({
          label: labelize(status),
          value: data ? countFor(status) : "–",
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, code or location" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={projectStatuses} allLabel="All statuses" />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No projects match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
      <ProjectFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} project={null} />
    </div>
  )
}
