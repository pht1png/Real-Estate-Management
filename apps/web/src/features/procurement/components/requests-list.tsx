"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"

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
import { RequestFormSheet } from "@/features/procurement/components/request-form-sheet"
import { ApprovalStatus } from "@/features/procurement/components/shared"
import { type RequestRow, type RequestStatus, requestStatuses } from "@/features/procurement/types"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { formatDate, formatMoney, labelize } from "@/lib/format"
import { trpc } from "@/utils/trpc"

const columns: Column<RequestRow>[] = [
  {
    header: "Request",
    cell: (r) => (
      <Link href={`/procurement/purchase-requests/${r.id}`} className="hover:underline">
        <Stacked primary={r.prNumber} secondary={formatDate(r.createdAt)} />
      </Link>
    ),
  },
  { header: "Project", cell: (r) => <Stacked primary={r.projectName} secondary={r.justification} /> },
  { header: "Department", cell: (r) => <Stacked primary={r.departmentName ?? "—"} secondary={r.requesterName} /> },
  { header: "Needed by", cell: (r) => formatDate(r.neededBy) },
  { header: "Estimate", cell: (r) => formatMoney(r.estimatedTotal), className: "text-right tabular-nums" },
  { header: "Status", cell: (r) => <ApprovalStatus status={r.status} step={r.approvalStep} /> },
]

const statCards = ["draft", "submitted", "approved", "ordered", "rejected"] as const

export function RequestsList() {
  const list = useListState<RequestStatus>()
  const [mine, setMine] = useState<"mine" | null>(null)
  const { data } = useQuery(
    trpc.procurement.requests.list.queryOptions(
      { ...list.query, status: list.filter ?? undefined, mine: mine === "mine" || undefined },
      { placeholderData: keepPreviousData },
    ),
  )
  const { canRequest } = useProcurementPermissions()
  const sheet = useDialogState<null>()
  const counts = new Map(data?.statusCounts.map((s) => [s.status, s.count]))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Purchase requests"
        description="Materials and services a department needs. Approved by the department's manager, then the owner."
        action={canRequest && <HeaderButton label="New request" onClick={() => sheet.show(null)} />}
      />
      <StatCards
        stats={statCards.map((status) => ({
          label: status === "submitted" ? "Waiting for approval" : labelize(status),
          value: counts.get(status) ?? 0,
          active: list.filter === status,
          onClick: () => list.setFilter(list.filter === status ? null : status),
        }))}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search number, purpose or project" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={requestStatuses} allLabel="All statuses" />
        <FilterSelect
          value={mine}
          onChange={(v) => {
            setMine(v)
            list.setPage(1)
          }}
          options={["mine"] as const}
          allLabel="Everyone's"
          labelFor={() => "Mine"}
        />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No purchase requests match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <RequestFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} request={null} />
    </div>
  )
}
