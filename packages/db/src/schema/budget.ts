import { date, index, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { project, projectPhase } from "./projects";
import { id, money, organizationId, paymentMethod, timestamps, userRef } from "./shared";

export const costCategory = pgEnum("cost_category", [
  "land",
  "design",
  "permits",
  "infrastructure",
  "construction",
  "materials",
  "labor",
  "marketing",
  "overhead",
  "other",
]);

/**
 * A line in the project budget (BOQ / cost code), e.g. "03-200 Structural steel".
 * PR items, PO items and expenses point here for budget-vs-actual reports.
 */
export const budgetLine = pgTable(
  "budget_line",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    phaseId: text("phase_id").references(() => projectPhase.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: costCategory("category").notNull(),
    budgetAmount: money("budget_amount").default("0").notNull(),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("budget_line_project_code_uidx").on(t.projectId, t.code),
    index("budget_line_phase_idx").on(t.phaseId),
  ],
);

/** Costs that don't go through a PO: permit fees, utilities, petty cash. */
export const expense = pgTable(
  "expense",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id),
    budgetLineId: text("budget_line_id").references(() => budgetLine.id, { onDelete: "set null" }),
    expenseDate: date("expense_date").notNull(),
    payee: text("payee"),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    vatAmount: money("vat_amount").default("0").notNull(),
    method: paymentMethod("method"),
    receiptNumber: text("receipt_number"),
    createdById: userRef("created_by_id"),
    ...timestamps(),
  },
  (t) => [
    index("expense_project_date_idx").on(t.projectId, t.expenseDate),
    index("expense_budget_line_idx").on(t.budgetLineId),
  ],
);
