"use client"

import { Button } from "@real-estate-management/ui/components/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@real-estate-management/ui/components/card"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@real-estate-management/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@real-estate-management/ui/components/select"
import { Skeleton } from "@real-estate-management/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@real-estate-management/ui/components/table"
import { cn } from "@real-estate-management/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react"

import { labelize } from "@/features/sales/lib/format"

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

export type Stat = { label: string; value: React.ReactNode; hint?: string; active?: boolean; onClick?: () => void }

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          size="sm"
          onClick={stat.onClick}
          className={cn(stat.onClick && "cursor-pointer hover:bg-muted/50", stat.active && "ring-2 ring-primary")}
        >
          <CardHeader>
            <CardDescription>{stat.label}</CardDescription>
            <CardTitle className="text-xl tabular-nums">{stat.value}</CardTitle>
            {stat.hint && <CardDescription>{stat.hint}</CardDescription>}
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <InputGroup className="w-full sm:max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </InputGroup>
  )
}

const ALL = "all"

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
  allLabel,
}: {
  value: T | null
  onChange: (value: T | null) => void
  options: readonly T[]
  allLabel: string
}) {
  const items = [
    { value: ALL, label: allLabel },
    ...options.map((option) => ({ value: option, label: labelize(option) })),
  ]
  return (
    <Select items={items} value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : (next as T))}>
      <SelectTrigger className="w-full sm:w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:items-center">{children}</div>
}

export type Column<T> = {
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
}: {
  columns: Column<T>[]
  rows: T[] | undefined
  emptyMessage: string
}) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {!rows &&
            Array.from({ length: 8 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
              <TableRow key={i}>
                {columns.map((column) => (
                  <TableCell key={column.header}>
                    <Skeleton className="h-4 w-full max-w-32" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {rows?.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {rows?.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.header} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {page} of {pageCount}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeftIcon />
          <span className="sr-only">Previous page</span>
        </Button>
        <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRightIcon />
          <span className="sr-only">Next page</span>
        </Button>
      </div>
    </div>
  )
}

/** Two-line cell: main text with a muted line underneath. */
export function Stacked({ primary, secondary }: { primary: React.ReactNode; secondary?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{primary}</span>
      {secondary && <span className="text-muted-foreground">{secondary}</span>}
    </div>
  )
}
