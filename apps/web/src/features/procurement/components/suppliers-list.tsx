"use client"

import { Badge } from "@real-estate-management/ui/components/badge"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"

import { ConfirmActionDialog } from "@/components/forms/confirm-action-dialog"
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
import { StatusBadge } from "@/components/list/status-badge"
import { SupplierFormSheet } from "@/features/procurement/components/supplier-form-sheet"
import type { SupplierRow } from "@/features/procurement/types"
import { useProcurementPermissions } from "@/hooks/use-access"
import { useDialogState } from "@/hooks/use-dialog-state"
import { useListState } from "@/hooks/use-list-state"
import { mutationCallbacks } from "@/lib/mutation"
import { trpc } from "@/utils/trpc"

const columns: Column<SupplierRow>[] = [
  {
    header: "Supplier",
    cell: (r) => (
      <div className="flex items-center gap-2">
        <Stacked primary={r.name} secondary={r.code} />
        {r.isSubcontractor && <Badge variant="outline">Subcontractor</Badge>}
      </div>
    ),
  },
  { header: "Category", cell: (r) => r.category ?? "—" },
  { header: "Contact", cell: (r) => <Stacked primary={r.contactName ?? "—"} secondary={r.phone ?? r.email} /> },
  { header: "Province", cell: (r) => r.province ?? "—" },
  { header: "Terms", cell: (r) => `${r.paymentTermDays} days`, className: "text-right tabular-nums" },
  { header: "Open orders", cell: (r) => r.openOrders, className: "text-right tabular-nums" },
  { header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
]

export function SuppliersList() {
  const list = useListState<"active" | "inactive">()
  const { data } = useQuery(
    trpc.procurement.suppliers.list.queryOptions(
      { ...list.query, active: list.filter === null ? undefined : list.filter === "active" },
      { placeholderData: keepPreviousData },
    ),
  )
  const { isStaff } = useProcurementPermissions()
  const sheet = useDialogState<SupplierRow>()
  const confirmDeactivate = useDialogState<SupplierRow>()
  const setActive = useMutation(
    trpc.procurement.suppliers.setActive.mutationOptions(
      mutationCallbacks("Supplier updated", confirmDeactivate.close),
    ),
  )

  const tableColumns = [
    ...columns,
    actionsColumn<SupplierRow>((row) => [
      { label: "Edit", onClick: () => sheet.show(row), hidden: !isStaff },
      {
        label: "Deactivate",
        onClick: () => confirmDeactivate.show(row),
        destructive: true,
        hidden: !isStaff || !row.isActive,
      },
      {
        label: "Reactivate",
        onClick: () => setActive.mutate({ id: row.id, active: true }),
        hidden: !isStaff || row.isActive,
      },
    ]),
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Suppliers"
        description="Material suppliers and subcontractors. Maintained by Procurement."
        action={isStaff && <HeaderButton label="New supplier" onClick={() => sheet.show(null)} />}
      />
      <Toolbar>
        <SearchInput
          value={list.search}
          onChange={list.setSearch}
          placeholder="Search name, code, category or tax ID"
        />
        <FilterSelect
          value={list.filter}
          onChange={list.setFilter}
          options={["active", "inactive"] as const}
          allLabel="All suppliers"
        />
      </Toolbar>
      <DataTable columns={tableColumns} rows={data?.rows} emptyMessage="No suppliers match your filters." />
      {data && <Pagination page={list.page} pageSize={data.pageSize} total={data.total} onPageChange={list.setPage} />}

      <SupplierFormSheet key={sheet.key} open={sheet.open} onOpenChange={sheet.setOpen} supplier={sheet.value} />
      <ConfirmActionDialog
        key={`deactivate-${confirmDeactivate.key}`}
        open={confirmDeactivate.open}
        onOpenChange={confirmDeactivate.setOpen}
        title={`Deactivate ${confirmDeactivate.value?.name ?? "supplier"}?`}
        description="Their history stays, but they can't get new purchase orders. You can reactivate them later."
        confirmLabel="Deactivate"
        destructive
        pending={setActive.isPending}
        onConfirm={() => confirmDeactivate.value && setActive.mutate({ id: confirmDeactivate.value.id, active: false })}
      />
    </div>
  )
}
