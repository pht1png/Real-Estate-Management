import type { AppRouter } from "@real-estate-management/api/routers/index"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

type SalesInputs = inferRouterInputs<AppRouter>["sales"]
type SalesOutputs = inferRouterOutputs<AppRouter>["sales"]

export type LeadStatus = NonNullable<SalesInputs["leads"]["list"]["status"]>
export type LeadSource = NonNullable<SalesInputs["leads"]["list"]["source"]>
export type ContactType = NonNullable<SalesInputs["contacts"]["list"]["type"]>
export type ReservationStatus = NonNullable<SalesInputs["reservations"]["list"]["status"]>
export type ContractStatus = NonNullable<SalesInputs["contracts"]["list"]["status"]>
export type PaymentMethod = NonNullable<SalesInputs["payments"]["list"]["method"]>

export type LeadRow = SalesOutputs["leads"]["list"]["rows"][number]
export type ContactRow = SalesOutputs["contacts"]["list"]["rows"][number]
export type ReservationRow = SalesOutputs["reservations"]["list"]["rows"][number]
export type ContractRow = SalesOutputs["contracts"]["list"]["rows"][number]
export type PaymentRow = SalesOutputs["payments"]["list"]["rows"][number]

export type SalesOptions = SalesOutputs["options"]["form"]
export type InstallmentRow = SalesOutputs["contracts"]["installments"][number]
export type CreateContractInput = SalesInputs["contracts"]["createFromReservation"]
export type UpdateContractInput = SalesInputs["contracts"]["update"]

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
