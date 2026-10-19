import type { AppRouter } from "@real-estate-management/api/routers/index"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

type SalesInputs = inferRouterInputs<AppRouter>["sales"]
type SalesOutputs = inferRouterOutputs<AppRouter>["sales"]

export type LeadStatus = NonNullable<SalesInputs["leads"]["status"]>
export type LeadSource = NonNullable<SalesInputs["leads"]["source"]>
export type ContactType = NonNullable<SalesInputs["contacts"]["type"]>
export type ReservationStatus = NonNullable<SalesInputs["reservations"]["status"]>
export type ContractStatus = NonNullable<SalesInputs["contracts"]["status"]>
export type PaymentMethod = NonNullable<SalesInputs["payments"]["method"]>

export type LeadRow = SalesOutputs["leads"]["rows"][number]
export type ContactRow = SalesOutputs["contacts"]["rows"][number]
export type ReservationRow = SalesOutputs["reservations"]["rows"][number]
export type ContractRow = SalesOutputs["contracts"]["rows"][number]
export type PaymentRow = SalesOutputs["payments"]["rows"][number]

export const leadStatuses = [
  "new",
  "contacted",
  "visited",
  "negotiating",
  "won",
  "lost",
] as const satisfies readonly LeadStatus[]
export const leadSources = [
  "walk_in",
  "website",
  "facebook",
  "line",
  "referral",
  "agent",
  "event",
  "other",
] as const satisfies readonly LeadSource[]
export const reservationStatuses = [
  "active",
  "converted",
  "cancelled",
  "expired",
] as const satisfies readonly ReservationStatus[]
export const contractStatuses = [
  "draft",
  "active",
  "transferred",
  "cancelled",
] as const satisfies readonly ContractStatus[]
export const paymentMethods = [
  "bank_transfer",
  "promptpay",
  "cash",
  "cheque",
  "credit_card",
] as const satisfies readonly PaymentMethod[]
