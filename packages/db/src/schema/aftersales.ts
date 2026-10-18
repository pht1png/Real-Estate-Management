import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { contact } from "./crm"
import { unit } from "./inventory"
import { supplier } from "./procurement"
import { salesContract } from "./sales"
import { id, organizationId, timestamps, userRef } from "./shared"

export const handoverStatus = pgEnum("handover_status", ["scheduled", "completed", "cancelled"])

export const defectStatus = pgEnum("defect_status", ["open", "in_progress", "resolved", "closed", "rejected"])

export const defectPriority = pgEnum("defect_priority", ["low", "medium", "high", "urgent"])

/** Handover inspection (ตรวจรับบ้าน/ห้อง) with the buyer before or at transfer. */
export const handover = pgTable(
  "handover",
  {
    id: id(),
    organizationId: organizationId(),
    contractId: text("contract_id")
      .notNull()
      .references(() => salesContract.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: handoverStatus("status").default("scheduled").notNull(),
    inspectorId: userRef("inspector_id"),
    customerSignedOff: boolean("customer_signed_off").default(false).notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("handover_contract_idx").on(t.contractId),
    index("handover_org_scheduled_idx").on(t.organizationId, t.scheduledAt),
  ],
)

/** Defect found at handover, or a warranty repair request after transfer. */
export const defectTicket = pgTable(
  "defect_ticket",
  {
    id: id(),
    organizationId: organizationId(),
    ticketNumber: text("ticket_number").notNull(),
    unitId: text("unit_id")
      .notNull()
      .references(() => unit.id),
    contractId: text("contract_id").references(() => salesContract.id, { onDelete: "set null" }),
    handoverId: text("handover_id").references(() => handover.id, { onDelete: "set null" }),
    reportedById: text("reported_by_id").references(() => contact.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Where in the unit, e.g. "Master bathroom". */
    location: text("location"),
    priority: defectPriority("priority").default("medium").notNull(),
    status: defectStatus("status").default("open").notNull(),
    assignedToId: userRef("assigned_to_id"),
    contractorId: text("contractor_id").references(() => supplier.id, { onDelete: "set null" }),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("defect_ticket_org_number_uidx").on(t.organizationId, t.ticketNumber),
    index("defect_ticket_unit_idx").on(t.unitId),
    index("defect_ticket_org_status_idx").on(t.organizationId, t.status),
    index("defect_ticket_assigned_to_idx").on(t.assignedToId),
  ],
)
