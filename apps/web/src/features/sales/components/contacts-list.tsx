"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  type Column,
  DataTable,
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  Toolbar,
} from "@/features/sales/components/list-layout"
import { useListState } from "@/features/sales/hooks/use-list-state"
import type { ContactRow, ContactType } from "@/features/sales/types"
import { trpc } from "@/utils/trpc"

const contactTypes = ["individual", "company"] as const satisfies readonly ContactType[]

const columns: Column<ContactRow>[] = [
  {
    header: "Name",
    cell: (r) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{r.name}</span>
        {r.type === "company" && <Badge variant="outline">Company</Badge>}
      </div>
    ),
  },
  { header: "Phone", cell: (r) => r.phone ?? "—" },
  {
    header: "Email / LINE",
    cell: (r) => <Stacked primary={r.email ?? "—"} secondary={r.lineId && `LINE: ${r.lineId}`} />,
  },
  { header: "Province", cell: (r) => r.province ?? "—" },
  { header: "Leads", cell: (r) => r.leads, className: "text-right tabular-nums" },
  { header: "Contracts", cell: (r) => r.contracts, className: "text-right tabular-nums" },
]

export function ContactsList() {
  const list = useListState<ContactType>()
  const { data } = useQuery(
    trpc.sales.contacts.queryOptions(
      { ...list.query, type: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Contacts" description="Prospects, buyers and co-buyers, both individuals and companies." />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, phone, email or LINE" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={contactTypes} allLabel="All types" />
      </Toolbar>
      <DataTable columns={columns} rows={data?.rows} emptyMessage="No contacts match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}
    </div>
  )
}
