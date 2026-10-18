import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { unitType } from "./inventory";
import { project } from "./projects";
import { address, id, money, organizationId, timestamps, userRef } from "./shared";

export const contactType = pgEnum("contact_type", ["individual", "company"]);

export const leadSource = pgEnum("lead_source", [
  "walk_in",
  "website",
  "facebook",
  "line",
  "referral",
  "agent",
  "event",
  "other",
]);

export const leadStatus = pgEnum("lead_status", ["new", "contacted", "visited", "negotiating", "won", "lost"]);

export const leadActivityType = pgEnum("lead_activity_type", [
  "call",
  "line_message",
  "email",
  "site_visit",
  "meeting",
  "note",
]);

/** A person or company: prospect, buyer or co-buyer. */
export const contact = pgTable(
  "contact",
  {
    id: id(),
    organizationId: organizationId(),
    type: contactType("type").default("individual").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    companyName: text("company_name"),
    email: text("email"),
    phone: text("phone"),
    lineId: text("line_id"),
    /** Thai national ID or company tax ID (13 digits). Restrict who can read it. */
    taxId: text("tax_id"),
    ...address(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("contact_org_phone_idx").on(t.organizationId, t.phone),
    index("contact_org_email_idx").on(t.organizationId, t.email),
  ],
);

/** A sales opportunity: one contact's interest in one project. */
export const lead = pgTable(
  "lead",
  {
    id: id(),
    organizationId: organizationId(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    interestedUnitTypeId: text("interested_unit_type_id").references(() => unitType.id, {
      onDelete: "set null",
    }),
    assignedToId: userRef("assigned_to_id"),
    source: leadSource("source").default("other").notNull(),
    status: leadStatus("status").default("new").notNull(),
    budgetMin: money("budget_min"),
    budgetMax: money("budget_max"),
    lostReason: text("lost_reason"),
    ...timestamps(),
  },
  (t) => [
    index("lead_org_status_idx").on(t.organizationId, t.status),
    index("lead_contact_idx").on(t.contactId),
    index("lead_project_idx").on(t.projectId),
    index("lead_assigned_to_idx").on(t.assignedToId),
  ],
);

/** Calls, LINE chats, site visits... logged against a lead. */
export const leadActivity = pgTable(
  "lead_activity",
  {
    id: id(),
    organizationId: organizationId(),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    type: leadActivityType("type").notNull(),
    summary: text("summary").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdById: userRef("created_by_id"),
    ...timestamps(),
  },
  (t) => [index("lead_activity_lead_idx").on(t.leadId, t.occurredAt)],
);
