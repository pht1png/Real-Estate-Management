import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { team } from "./auth";
import { budgetLine } from "./budget";
import { project } from "./projects";
import {
  address,
  id,
  money,
  organizationId,
  paymentMethod,
  percent,
  quantity,
  timestamps,
  userRef,
} from "./shared";

/** Who a submitted PR / pending PO is waiting on: the department's manager first, then the owner. */
export const approvalStep = pgEnum("approval_step", ["manager", "owner"]);

export const purchaseRequestStatus = pgEnum("purchase_request_status", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "ordered",
  "cancelled",
]);

export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "partially_received",
  "received",
  "closed",
  "cancelled",
]);

export const supplierInvoiceStatus = pgEnum("supplier_invoice_status", [
  "received",
  "approved",
  "partially_paid",
  "paid",
  "cancelled",
]);

/** Material suppliers and subcontractors. */
export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    organizationId: organizationId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    category: text("category"),
    isSubcontractor: boolean("is_subcontractor").default(false).notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    ...address(),
    paymentTermDays: integer("payment_term_days").default(30).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("supplier_org_code_uidx").on(t.organizationId, t.code),
    index("supplier_org_name_idx").on(t.organizationId, t.name),
  ],
);

/** Purchase requisition (PR): site team asks for materials, a manager approves. */
export const purchaseRequest = pgTable(
  "purchase_request",
  {
    id: id(),
    organizationId: organizationId(),
    prNumber: text("pr_number").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    status: purchaseRequestStatus("status").default("draft").notNull(),
    requestedById: userRef("requested_by_id"),
    /** Department (team) that needs it; its manager approves first. */
    departmentId: text("department_id").references(() => team.id),
    justification: text("justification"),
    /** Sum of line estimates, kept in step with the lines on every save. */
    estimatedTotal: money("estimated_total").default("0").notNull(),
    approvalStep: approvalStep("approval_step"),
    managerApprovedById: userRef("manager_approved_by_id"),
    managerApprovedAt: timestamp("manager_approved_at", { withTimezone: true }),
    /** Owner's (final) approval. */
    approvedById: userRef("approved_by_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    cancelReason: text("cancel_reason"),
    neededBy: date("needed_by"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("purchase_request_org_number_uidx").on(t.organizationId, t.prNumber),
    index("purchase_request_project_idx").on(t.projectId),
    index("purchase_request_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const purchaseRequestItem = pgTable(
  "purchase_request_item",
  {
    id: id(),
    organizationId: organizationId(),
    purchaseRequestId: text("purchase_request_id")
      .notNull()
      .references(() => purchaseRequest.id, { onDelete: "cascade" }),
    budgetLineId: text("budget_line_id").references(() => budgetLine.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: quantity("quantity").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    estimatedUnitPrice: money("estimated_unit_price"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("purchase_request_item_pr_idx").on(t.purchaseRequestId),
    check("purchase_request_item_quantity_positive_chk", sql`${t.quantity} > 0`),
  ],
);

/** Purchase order (PO) sent to a supplier. Totals are a snapshot computed by the app. */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: id(),
    organizationId: organizationId(),
    poNumber: text("po_number").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id),
    purchaseRequestId: text("purchase_request_id").references(() => purchaseRequest.id, {
      onDelete: "set null",
    }),
    status: purchaseOrderStatus("status").default("draft").notNull(),
    orderDate: date("order_date").notNull(),
    expectedDeliveryDate: date("expected_delivery_date"),
    deliveryAddress: text("delivery_address"),
    subtotal: money("subtotal").default("0").notNull(),
    discountAmount: money("discount_amount").default("0").notNull(),
    vatRate: percent("vat_rate").default("7.00").notNull(),
    vatAmount: money("vat_amount").default("0").notNull(),
    /** Expected withholding tax (e.g. 3% for subcontracted services). */
    whtRate: percent("wht_rate").default("0").notNull(),
    total: money("total").default("0").notNull(),
    createdById: userRef("created_by_id"),
    approvalStep: approvalStep("approval_step"),
    managerApprovedById: userRef("manager_approved_by_id"),
    managerApprovedAt: timestamp("manager_approved_at", { withTimezone: true }),
    /** Owner's (final) approval. */
    approvedById: userRef("approved_by_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("purchase_order_org_number_uidx").on(t.organizationId, t.poNumber),
    index("purchase_order_project_idx").on(t.projectId),
    index("purchase_order_supplier_idx").on(t.supplierId),
    index("purchase_order_org_status_idx").on(t.organizationId, t.status),
  ],
);

export const purchaseOrderItem = pgTable(
  "purchase_order_item",
  {
    id: id(),
    organizationId: organizationId(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    purchaseRequestItemId: text("purchase_request_item_id").references(() => purchaseRequestItem.id, {
      onDelete: "set null",
    }),
    budgetLineId: text("budget_line_id").references(() => budgetLine.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: quantity("quantity").notNull(),
    unitOfMeasure: text("unit_of_measure").notNull(),
    unitPrice: money("unit_price").notNull(),
    /** Computed by Postgres; read-only from Drizzle. */
    amount: money("amount").generatedAlwaysAs(sql`quantity * unit_price`),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("purchase_order_item_po_idx").on(t.purchaseOrderId),
    index("purchase_order_item_budget_line_idx").on(t.budgetLineId),
    check("purchase_order_item_quantity_positive_chk", sql`${t.quantity} > 0`),
  ],
);

/** Goods receipt (GR): what actually arrived on site against a PO. */
export const goodsReceipt = pgTable(
  "goods_receipt",
  {
    id: id(),
    organizationId: organizationId(),
    grNumber: text("gr_number").notNull(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    receivedOn: date("received_on").notNull(),
    receivedById: userRef("received_by_id"),
    deliveryNoteNumber: text("delivery_note_number"),
    notes: text("notes"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    voidedById: userRef("voided_by_id"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("goods_receipt_org_number_uidx").on(t.organizationId, t.grNumber),
    index("goods_receipt_po_idx").on(t.purchaseOrderId),
  ],
);

/** Received quantity per PO line. Sum these to get "received so far". */
export const goodsReceiptItem = pgTable(
  "goods_receipt_item",
  {
    id: id(),
    organizationId: organizationId(),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipt.id, { onDelete: "cascade" }),
    purchaseOrderItemId: text("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItem.id),
    quantityReceived: quantity("quantity_received").notNull(),
    quantityRejected: quantity("quantity_rejected").default("0").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("goods_receipt_item_gr_idx").on(t.goodsReceiptId),
    index("goods_receipt_item_po_item_idx").on(t.purchaseOrderItemId),
    check("goods_receipt_item_quantity_chk", sql`${t.quantityReceived} >= 0 and ${t.quantityRejected} >= 0`),
  ],
);

/** Supplier's tax invoice (bill) to be paid. */
export const supplierInvoice = pgTable(
  "supplier_invoice",
  {
    id: id(),
    organizationId: organizationId(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => supplier.id),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrder.id),
    /** For bills without a PO; otherwise the project comes from the PO. */
    projectId: text("project_id").references(() => project.id),
    /** The supplier's own invoice number. */
    invoiceNumber: text("invoice_number").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    subtotal: money("subtotal").notNull(),
    vatAmount: money("vat_amount").default("0").notNull(),
    total: money("total").notNull(),
    status: supplierInvoiceStatus("status").default("received").notNull(),
    approvedById: userRef("approved_by_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("supplier_invoice_supplier_number_uidx").on(t.supplierId, t.invoiceNumber),
    index("supplier_invoice_org_status_idx").on(t.organizationId, t.status),
    index("supplier_invoice_org_due_idx").on(t.organizationId, t.dueDate),
    index("supplier_invoice_po_idx").on(t.purchaseOrderId),
  ],
);

/** Payment to a supplier. Withholding tax is deducted at payment time. */
export const supplierPayment = pgTable(
  "supplier_payment",
  {
    id: id(),
    organizationId: organizationId(),
    paymentNumber: text("payment_number").notNull(),
    supplierInvoiceId: text("supplier_invoice_id")
      .notNull()
      .references(() => supplierInvoice.id),
    /** Net amount actually transferred. */
    amount: money("amount").notNull(),
    whtAmount: money("wht_amount").default("0").notNull(),
    method: paymentMethod("method").notNull(),
    paidOn: date("paid_on").notNull(),
    bankReference: text("bank_reference"),
    paidById: userRef("paid_by_id"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("supplier_payment_org_number_uidx").on(t.organizationId, t.paymentNumber),
    index("supplier_payment_invoice_idx").on(t.supplierInvoiceId),
    check("supplier_payment_amount_positive_chk", sql`${t.amount} > 0`),
  ],
);
