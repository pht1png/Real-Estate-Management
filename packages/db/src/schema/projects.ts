import { date, index, integer, numeric, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { address, id, organizationId, timestamps } from "./shared";

export const projectType = pgEnum("project_type", [
  "condominium",
  "single_house",
  "townhouse",
  "land_plot",
  "commercial",
  "mixed_use",
]);

export const projectStatus = pgEnum("project_status", [
  "planning",
  "pre_sale",
  "under_construction",
  "completed",
  "on_hold",
  "cancelled",
]);


export const project = pgTable(
  "project",
  {
    id: id(),
    organizationId: organizationId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    type: projectType("type").notNull(),
    status: projectStatus("status").default("planning").notNull(),
    description: text("description"),
    ...address(),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    landAreaSqw: numeric("land_area_sqw", { precision: 12, scale: 2 }),
    launchDate: date("launch_date"),
    expectedCompletionDate: date("expected_completion_date"),
    coverImageUrl: text("cover_image_url"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("project_org_code_uidx").on(t.organizationId, t.code),
    uniqueIndex("project_org_slug_uidx").on(t.organizationId, t.slug),
    index("project_org_status_idx").on(t.organizationId, t.status),
  ],
);

/** A phase, zone or building inside a project, e.g. "Phase 1" or "Building A". */
export const projectPhase = pgTable(
  "project_phase",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    ...timestamps(),
  },
  (t) => [index("project_phase_project_idx").on(t.projectId)],
);

