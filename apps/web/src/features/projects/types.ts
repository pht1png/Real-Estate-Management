import type { AppRouter } from "@real-estate-management/api/routers/index"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

type Inputs = inferRouterInputs<AppRouter>["projects"]
type Outputs = inferRouterOutputs<AppRouter>["projects"]

export type ProjectRow = Outputs["projects"]["list"]["rows"][number]
export type ProjectDetail = Outputs["projects"]["get"]
export type PhaseRow = ProjectDetail["phases"][number]
export type UnitTypeRow = Outputs["unitTypes"]["list"][number]
export type UnitRow = Outputs["units"]["list"]["rows"][number]

export type ProjectStatus = NonNullable<Inputs["projects"]["list"]["status"]>
export type ProjectType = NonNullable<Inputs["projects"]["list"]["type"]>
export type UnitStatus = NonNullable<Inputs["units"]["list"]["status"]>

export const projectStatuses = [
  "planning",
  "pre_sale",
  "under_construction",
  "completed",
  "on_hold",
  "cancelled",
] as const satisfies readonly ProjectStatus[]

export const projectTypes = [
  "condominium",
  "single_house",
  "townhouse",
  "land_plot",
  "commercial",
  "mixed_use",
] as const satisfies readonly ProjectType[]

export const unitStatuses = [
  "available",
  "on_hold",
  "reserved",
  "contracted",
  "transferred",
  "unavailable",
] as const satisfies readonly UnitStatus[]
