import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { id, organizationId, userRef } from "./shared";

/** Every record type that can have files or audit entries attached. */
export const entityType = pgEnum("entity_type", [
  "project",
  "unit",
  "contact",
  "lead",
  "reservation",
  "sales_contract",
  "customer_payment",
  "purchase_request",
  "purchase_order",
  "goods_receipt",
  "supplier_invoice",
  "supplier_payment",
  "expense",
  "handover",
  "defect_ticket",
]);

/**
 * Files stored in object storage (S3, R2...), attached to any record.
 * Polymorphic: entityId has no foreign key, so delete attachments in app code
 * when you delete the record they belong to.
 */
export const attachment = pgTable(
  "attachment",
  {
    id: id(),
    organizationId: organizationId(),
    entityType: entityType("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedById: userRef("uploaded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("attachment_entity_idx").on(t.entityType, t.entityId),
    index("attachment_org_idx").on(t.organizationId),
  ],
);

/** Append-only audit trail: who changed what, and when. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    organizationId: organizationId(),
    userId: userRef("user_id"),
    entityType: entityType("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** e.g. "created", "updated", "status_changed", "deleted". */
    action: text("action").notNull(),
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("activity_log_entity_idx").on(t.organizationId, t.entityType, t.entityId),
    index("activity_log_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);
