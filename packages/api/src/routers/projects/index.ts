import { router } from "../../index"
import { phasesRouter } from "./phases"
import { projectsRouter as projectRecords } from "./projects"
import { unitTypesRouter } from "./unit-types"
import { unitsRouter } from "./units"

/** Projects tab: everyone reads; admin/manager update; the owner creates and deletes. */
export const projectsRouter = router({
  projects: projectRecords,
  phases: phasesRouter,
  unitTypes: unitTypesRouter,
  units: unitsRouter,
})
