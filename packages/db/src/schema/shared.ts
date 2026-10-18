import { numeric, pgEnum, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/*
 * Foreign key conventions used across the domain files:
 *
 * - organizationId → cascade. Deleting an organization (tenant) deletes all its data.
 * - Child rows (PO items, installments...) → cascade from their parent document.
 * - Business references (contract → unit, PO → supplier...) → no onDelete (NO ACTION).
 *   This blocks deleting a referenced row directly, but still lets an organization
 *   delete cascade through, because NO ACTION is checked at the end of the statement.
 *   Don't switch these to "restrict": RESTRICT is checked immediately and would break
 *   the organization cascade.
 * - Optional links to users → set null, so removing a user keeps the history.
 */

/** Text primary key, matching Better Auth's id type. */
export const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

/** Tenant column present on every domain table. */
export const organizationId = () =>
  text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

/** Optional reference to a user that survives the user being deleted. */
export const userRef = (name: string) => text(name).references(() => user.id, { onDelete: "set null" });

/** Money (THB). numeric avoids float rounding; Drizzle returns it as a string. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/** Material quantities, e.g. 12.500 m³ of concrete. */
export const quantity = (name: string) => numeric(name, { precision: 14, scale: 3 });

/** Percentages, e.g. 7.00 for VAT or 3.00 for withholding tax. */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 });

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** Thai Post-style address block, reused by projects, contacts and suppliers. */
export const address = () => ({
  addressLine: text("address_line"),
  subdistrict: text("subdistrict"),
  district: text("district"),
  province: text("province"),
  postalCode: text("postal_code"),
});

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "promptpay",
  "cheque",
  "credit_card",
]);
