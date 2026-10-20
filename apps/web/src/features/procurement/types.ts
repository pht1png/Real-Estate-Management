import type { AppRouter } from "@real-estate-management/api/routers/index"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

type ProcurementInputs = inferRouterInputs<AppRouter>["procurement"]
type ProcurementOutputs = inferRouterOutputs<AppRouter>["procurement"]

export type RequestStatus = NonNullable<ProcurementInputs["requests"]["list"]["status"]>
export type OrderStatus = NonNullable<ProcurementInputs["orders"]["list"]["status"]>

export type RequestRow = ProcurementOutputs["requests"]["list"]["rows"][number]
export type RequestDetail = ProcurementOutputs["requests"]["get"]
export type OrderRow = ProcurementOutputs["orders"]["list"]["rows"][number]
export type OrderDetail = ProcurementOutputs["orders"]["get"]
export type ReceiptRow = ProcurementOutputs["receipts"]["list"]["rows"][number]
export type SupplierRow = ProcurementOutputs["suppliers"]["list"]["rows"][number]
export type ProcurementOptions = ProcurementOutputs["options"]["form"]
export type TimelineEntry = RequestDetail["timeline"][number]
export type BudgetWarning = RequestDetail["budgetWarnings"][number]

export const requestStatuses = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "ordered",
  "cancelled",
] as const satisfies readonly RequestStatus[]

export const orderStatuses = [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
] as const satisfies readonly OrderStatus[]
