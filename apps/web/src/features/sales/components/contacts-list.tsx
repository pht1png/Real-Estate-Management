"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
import { ContactFormSheet } from "@/features/sales/components/contact-form-sheet"
import {
  actionsColumn,
  type Column,
  DataTable,
  FilterSelect,
  HeaderButton,
  PageHeader,
  Pagination,
  SearchInput,
  Stacked,
  Toolbar,
} from "@/components/list/list-layout"
import { useSalesPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { mutationCallbacks } from "@/lib/mutation"
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
    trpc.sales.contacts.list.queryOptions(
      { ...list.query, type: list.filter ?? undefined },
      { placeholderData: keepPreviousData },
    ),
  )

  const { canCreate, canUpdate, canDelete } = useSalesPermissions()
  const sheet = useDialogState<ContactRow>()
  const confirmDelete = useDialogState<ContactRow>()
  const remove = useMutation(
    trpc.sales.contacts.delete.mutationOptions(mutationCallbacks("Contact deleted", confirmDelete.close)),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<ContactRow>((row) => [
      { label: "Edit", onClick: () => sheet.show(row), hidden: !canUpdate },
      { label: "Delete", onClick: () => confirmDelete.show(row), destructive: true, hidden: !canDelete },
    ]),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contacts"
        description="Prospects, buyers and co-buyers, both individuals and companies."
        action={canCreate && <HeaderButton label="New contact" onClick={() => sheet.show(null)} />}
      />
      <Toolbar>
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Search name, phone, email or LINE" />
        <FilterSelect value={list.filter} onChange={list.setFilter} options={contactTypes} allLabel="All types" />
      </Toolbar>
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No contacts match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <ContactFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} contact={sheet.value} />
      <ConfirmActionDialog
        open={confirmDelete.open}
        onOpenChange={confirmDelete.setOpen}
        title={`Delete ${confirmDelete.value?.name ?? "contact"}?`}
        description="Their leads are deleted too. Contacts with reservations, contracts or payments can't be deleted."
        confirmLabel="Delete contact"
        destructive
        pending={remove.isPending}
        onConfirm={() => confirmDelete.value && remove.mutate({ id: confirmDelete.value.id })}
      />
    </div>
  )
}
