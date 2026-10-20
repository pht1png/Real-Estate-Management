import { sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { contact, lead } from "./crm";
import { unit } from "./inventory";
import { id, money, organizationId, paymentMethod, timestamps, userRef } from "./shared";

export const reservationStatus = pgEnum("reservation_status", ["active", "converted", "cancelled", "expired"]);

export const contractStatus = pgEnum("contract_status", ["draft", "active", "transferred", "cancelled"]);

export const installmentType = pgEnum("installment_type", [
  "contract_payment",
  "down_payment",
  "transfer_payment",
  "other",
]);

export const installmentStatus = pgEnum("installment_status", ["pending", "partially_paid", "paid", "waived"]);

export const mortgageStatus = pgEnum("mortgage_status", [
  "preparing",
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
]);

/** Booking (จอง): a reservation fee holds a unit for a buyer. */
export const reservation = pgTable(
  "reservation",
  {
    id: id(),
    organizationId: organizationId(),
    reservationNumber: text("reservation_number").notNull(),
    unitId: text("unit_id")
      .notNull()
      .references(() => unit.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "set null" }),
    salespersonId: userRef("salesperson_id"),
    reservationFee: money("reservation_fee").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: reservationStatus("status").default("active").notNull(),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("reservation_org_number_uidx").on(t.organizationId, t.reservationNumber),
    // Prevents double-booking: at most one active reservation per unit.
    uniqueIndex("reservation_unit_active_uidx")
      .on(t.unitId)
      .where(sql`status = 'active'`),
    index("reservation_contact_idx").on(t.contactId),
    index("reservation_lead_idx").on(t.leadId),
  ],
);

/** Agreement to sell (สัญญาจะซื้อจะขาย), through to ownership transfer. */
export const salesContract = pgTable(
  "sales_contract",
  {
    id: id(),
    organizationId: organizationId(),
    contractNumber: text("contract_number").notNull(),
    unitId: text("unit_id")
      .notNull()
      .references(() => unit.id),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => contact.id),
    reservationId: text("reservation_id").references(() => reservation.id, { onDelete: "set null" }),
    contractDate: date("contract_date").notNull(),
    salePrice: money("sale_price").notNull(),
    discountAmount: money("discount_amount").default("0").notNull(),
    netPrice: money("net_price").notNull(),
    downPaymentAmount: money("down_payment_amount").default("0").notNull(),
    status: contractStatus("status").default("draft").notNull(),
    scheduledTransferDate: date("scheduled_transfer_date"),
    transferredOn: date("transferred_on"),
    createdById: userRef("created_by_id"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("sales_contract_org_number_uidx").on(t.organizationId, t.contractNumber),
    // One live contract per unit; cancelled contracts don't count.
    uniqueIndex("sales_contract_unit_open_uidx")
      .on(t.unitId)
      .where(sql`status <> 'cancelled'`),
    uniqueIndex("sales_contract_reservation_uidx").on(t.reservationId),
    index("sales_contract_buyer_idx").on(t.buyerId),
    index("sales_contract_org_status_idx").on(t.organizationId, t.status),
  ],
);

/** Payment schedule: contract payment, monthly down-payment installments, transfer payment. */
export const installment = pgTable(
  "installment",
  {
    id: id(),
    organizationId: organizationId(),
    contractId: text("contract_id")
      .notNull()
      .references(() => salesContract.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: installmentType("type").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    status: installmentStatus("status").default("pending").notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("installment_contract_sequence_uidx").on(t.contractId, t.sequence),
    index("installment_org_due_idx").on(t.organizationId, t.dueDate),
    check("installment_amount_positive_chk", sql`${t.amount} > 0`),
  ],
);

/** Money received from a buyer: reservation fee, installment or transfer payment. */
export const customerPayment = pgTable(
  "customer_payment",
  {
    id: id(),
    organizationId: organizationId(),
    receiptNumber: text("receipt_number").notNull(),
    payerId: text("payer_id")
      .notNull()
      .references(() => contact.id),
    reservationId: text("reservation_id").references(() => reservation.id),
    contractId: text("contract_id").references(() => salesContract.id),
    installmentId: text("installment_id").references(() => installment.id, { onDelete: "set null" }),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    bankReference: text("bank_reference"),
    recordedById: userRef("recorded_by_id"),
    notes: text("notes"),
    /** Voided payments stay for audit but no longer count towards installments or totals. */
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedById: userRef("voided_by_id"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("customer_payment_org_receipt_uidx").on(t.organizationId, t.receiptNumber),
    index("customer_payment_contract_idx").on(t.contractId),
    index("customer_payment_reservation_idx").on(t.reservationId),
    index("customer_payment_installment_idx").on(t.installmentId),
    check("customer_payment_amount_positive_chk", sql`${t.amount} > 0`),
    check(
      "customer_payment_target_chk",
      sql`${t.reservationId} is not null or ${t.contractId} is not null`,
    ),
  ],
);

/** Buyer's bank loan application, tracked so transfers can be scheduled. */
export const mortgageApplication = pgTable(
  "mortgage_application",
  {
    id: id(),
    organizationId: organizationId(),
    contractId: text("contract_id")
      .notNull()
      .references(() => salesContract.id, { onDelete: "cascade" }),
    bankName: text("bank_name").notNull(),
    requestedAmount: money("requested_amount"),
    approvedAmount: money("approved_amount"),
    status: mortgageStatus("status").default("preparing").notNull(),
    submittedOn: date("submitted_on"),
    decidedOn: date("decided_on"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [index("mortgage_application_contract_idx").on(t.contractId)],
);
