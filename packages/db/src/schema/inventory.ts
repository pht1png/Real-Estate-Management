import { index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { project, projectPhase } from "./projects";
import { id, money, organizationId, timestamps } from "./shared";

export const unitStatus = pgEnum("unit_status", [
  "available",
  "on_hold",
  "reserved",
  "contracted",
  "transferred",
  "unavailable",
]);

/** A house model or condo floor plan, e.g. "Type A – 3 bed". */
export const unitType = pgTable(
  "unit_type",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    bedrooms: integer("bedrooms"),
    bathrooms: integer("bathrooms"),
    parkingSpaces: integer("parking_spaces"),
    usableAreaSqm: numeric("usable_area_sqm", { precision: 10, scale: 2 }),
    /** Land plot size in square wah (1 sq wah = 4 m²). Null for condos. */
    landAreaSqw: numeric("land_area_sqw", { precision: 10, scale: 2 }),
    basePrice: money("base_price"),
    floorPlanUrl: text("floor_plan_url"),
    description: text("description"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("unit_type_project_code_uidx").on(t.projectId, t.code)],
);

/** A sellable unit: a condo room or a house plot. */
export const unit = pgTable(
  "unit",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    phaseId: text("phase_id").references(() => projectPhase.id, { onDelete: "set null" }),
    unitTypeId: text("unit_type_id").references(() => unitType.id, { onDelete: "set null" }),
    unitNumber: text("unit_number").notNull(),
    /** Official house number (บ้านเลขที่) from the district office, e.g. "99/123". Null until assigned. */
    houseNumber: text("house_number"),
    floor: integer("floor"),
    facing: text("facing"),
    usableAreaSqm: numeric("usable_area_sqm", { precision: 10, scale: 2 }),
    landAreaSqw: numeric("land_area_sqw", { precision: 10, scale: 2 }),
    listPrice: money("list_price").notNull(),
    status: unitStatus("status").default("available").notNull(),
    titleDeedNumber: text("title_deed_number"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("unit_project_number_uidx").on(t.projectId, t.unitNumber),
    index("unit_project_status_idx").on(t.projectId, t.status),
    index("unit_phase_idx").on(t.phaseId),
    index("unit_unit_type_idx").on(t.unitTypeId),
  ],
);
