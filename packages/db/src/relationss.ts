import { defineRelationsPart } from "drizzle-orm"
import * as schema from "./schema"
import { authRelations } from "./schema/auth"

/*
 * One relations part per domain.
 *
 * OWNERSHIP RULE: each table key (project, unit, purchaseOrder...) appears in
 * exactly ONE part, the part of the domain that owns the table. The parts are
 * merged with a shallow spread, so a second `project: {...}` in another part
 * would silently replace the first one.
 *
 * That's also why Better Auth's tables (user, organization) get no reverse
 * relations here: authRelations owns those keys. Query from the domain side
 * instead, e.g. db.query.project.findMany({ where: { organizationId } }).
 *
 * Every relation names `from` and `to` explicitly, so nothing depends on
 * inference across parts.
 */

export const projectsRelations = defineRelationsPart(schema, (r) => ({
  project: {
    organization: r.one.organization({ from: r.project.organizationId, to: r.organization.id, optional: false }),
    phases: r.many.projectPhase({ from: r.project.id, to: r.projectPhase.projectId }),
    members: r.many.projectMember({ from: r.project.id, to: r.projectMember.projectId }),
    unitTypes: r.many.unitType({ from: r.project.id, to: r.unitType.projectId }),
    units: r.many.unit({ from: r.project.id, to: r.unit.projectId }),
    leads: r.many.lead({ from: r.project.id, to: r.lead.projectId }),
    budgetLines: r.many.budgetLine({ from: r.project.id, to: r.budgetLine.projectId }),
    expenses: r.many.expense({ from: r.project.id, to: r.expense.projectId }),
    purchaseRequests: r.many.purchaseRequest({ from: r.project.id, to: r.purchaseRequest.projectId }),
    purchaseOrders: r.many.purchaseOrder({ from: r.project.id, to: r.purchaseOrder.projectId }),
    supplierInvoices: r.many.supplierInvoice({ from: r.project.id, to: r.supplierInvoice.projectId }),
    attachments: r.many.attachment({
      from: r.project.id,
      to: r.attachment.entityId,
      where: { entityType: "project" },
    }),
  },
  projectPhase: {
    project: r.one.project({ from: r.projectPhase.projectId, to: r.project.id, optional: false }),
    units: r.many.unit({ from: r.projectPhase.id, to: r.unit.phaseId }),
    budgetLines: r.many.budgetLine({ from: r.projectPhase.id, to: r.budgetLine.phaseId }),
  },
  projectMember: {
    project: r.one.project({ from: r.projectMember.projectId, to: r.project.id, optional: false }),
    user: r.one.user({ from: r.projectMember.userId, to: r.user.id, optional: false }),
  },
}))

export const inventoryRelations = defineRelationsPart(schema, (r) => ({
  unitType: {
    project: r.one.project({ from: r.unitType.projectId, to: r.project.id, optional: false }),
    units: r.many.unit({ from: r.unitType.id, to: r.unit.unitTypeId }),
  },
  unit: {
    project: r.one.project({ from: r.unit.projectId, to: r.project.id, optional: false }),
    phase: r.one.projectPhase({ from: r.unit.phaseId, to: r.projectPhase.id }),
    unitType: r.one.unitType({ from: r.unit.unitTypeId, to: r.unitType.id }),
    reservations: r.many.reservation({ from: r.unit.id, to: r.reservation.unitId }),
    contracts: r.many.salesContract({ from: r.unit.id, to: r.salesContract.unitId }),
    defectTickets: r.many.defectTicket({ from: r.unit.id, to: r.defectTicket.unitId }),
    attachments: r.many.attachment({
      from: r.unit.id,
      to: r.attachment.entityId,
      where: { entityType: "unit" },
    }),
  },
}))

export const crmRelations = defineRelationsPart(schema, (r) => ({
  contact: {
    leads: r.many.lead({ from: r.contact.id, to: r.lead.contactId }),
    reservations: r.many.reservation({ from: r.contact.id, to: r.reservation.contactId }),
    contracts: r.many.salesContract({ from: r.contact.id, to: r.salesContract.buyerId }),
    payments: r.many.customerPayment({ from: r.contact.id, to: r.customerPayment.payerId }),
    defectTickets: r.many.defectTicket({ from: r.contact.id, to: r.defectTicket.reportedById }),
    attachments: r.many.attachment({
      from: r.contact.id,
      to: r.attachment.entityId,
      where: { entityType: "contact" },
    }),
  },
  lead: {
    contact: r.one.contact({ from: r.lead.contactId, to: r.contact.id, optional: false }),
    project: r.one.project({ from: r.lead.projectId, to: r.project.id }),
    interestedUnitType: r.one.unitType({ from: r.lead.interestedUnitTypeId, to: r.unitType.id }),
    assignedTo: r.one.user({ from: r.lead.assignedToId, to: r.user.id }),
    activities: r.many.leadActivity({ from: r.lead.id, to: r.leadActivity.leadId }),
    reservations: r.many.reservation({ from: r.lead.id, to: r.reservation.leadId }),
  },
  leadActivity: {
    lead: r.one.lead({ from: r.leadActivity.leadId, to: r.lead.id, optional: false }),
    createdBy: r.one.user({ from: r.leadActivity.createdById, to: r.user.id }),
  },
}))

export const salesRelations = defineRelationsPart(schema, (r) => ({
  reservation: {
    unit: r.one.unit({ from: r.reservation.unitId, to: r.unit.id, optional: false }),
    contact: r.one.contact({ from: r.reservation.contactId, to: r.contact.id, optional: false }),
    lead: r.one.lead({ from: r.reservation.leadId, to: r.lead.id }),
    salesperson: r.one.user({ from: r.reservation.salespersonId, to: r.user.id }),
    contract: r.one.salesContract({ from: r.reservation.id, to: r.salesContract.reservationId }),
    payments: r.many.customerPayment({ from: r.reservation.id, to: r.customerPayment.reservationId }),
  },
  salesContract: {
    unit: r.one.unit({ from: r.salesContract.unitId, to: r.unit.id, optional: false }),
    buyer: r.one.contact({ from: r.salesContract.buyerId, to: r.contact.id, optional: false }),
    reservation: r.one.reservation({ from: r.salesContract.reservationId, to: r.reservation.id }),
    createdBy: r.one.user({ from: r.salesContract.createdById, to: r.user.id }),
    installments: r.many.installment({ from: r.salesContract.id, to: r.installment.contractId }),
    payments: r.many.customerPayment({ from: r.salesContract.id, to: r.customerPayment.contractId }),
    mortgageApplications: r.many.mortgageApplication({
      from: r.salesContract.id,
      to: r.mortgageApplication.contractId,
    }),
    handovers: r.many.handover({ from: r.salesContract.id, to: r.handover.contractId }),
    defectTickets: r.many.defectTicket({ from: r.salesContract.id, to: r.defectTicket.contractId }),
    attachments: r.many.attachment({
      from: r.salesContract.id,
      to: r.attachment.entityId,
      where: { entityType: "sales_contract" },
    }),
  },
  installment: {
    contract: r.one.salesContract({ from: r.installment.contractId, to: r.salesContract.id, optional: false }),
    payments: r.many.customerPayment({ from: r.installment.id, to: r.customerPayment.installmentId }),
  },
  customerPayment: {
    payer: r.one.contact({ from: r.customerPayment.payerId, to: r.contact.id, optional: false }),
    reservation: r.one.reservation({ from: r.customerPayment.reservationId, to: r.reservation.id }),
    contract: r.one.salesContract({ from: r.customerPayment.contractId, to: r.salesContract.id }),
    installment: r.one.installment({ from: r.customerPayment.installmentId, to: r.installment.id }),
    recordedBy: r.one.user({ from: r.customerPayment.recordedById, to: r.user.id }),
  },
  mortgageApplication: {
    contract: r.one.salesContract({
      from: r.mortgageApplication.contractId,
      to: r.salesContract.id,
      optional: false,
    }),
  },
}))

export const budgetRelations = defineRelationsPart(schema, (r) => ({
  budgetLine: {
    project: r.one.project({ from: r.budgetLine.projectId, to: r.project.id, optional: false }),
    phase: r.one.projectPhase({ from: r.budgetLine.phaseId, to: r.projectPhase.id }),
    purchaseRequestItems: r.many.purchaseRequestItem({
      from: r.budgetLine.id,
      to: r.purchaseRequestItem.budgetLineId,
    }),
    purchaseOrderItems: r.many.purchaseOrderItem({ from: r.budgetLine.id, to: r.purchaseOrderItem.budgetLineId }),
    expenses: r.many.expense({ from: r.budgetLine.id, to: r.expense.budgetLineId }),
  },
  expense: {
    project: r.one.project({ from: r.expense.projectId, to: r.project.id, optional: false }),
    budgetLine: r.one.budgetLine({ from: r.expense.budgetLineId, to: r.budgetLine.id }),
    createdBy: r.one.user({ from: r.expense.createdById, to: r.user.id }),
    attachments: r.many.attachment({
      from: r.expense.id,
      to: r.attachment.entityId,
      where: { entityType: "expense" },
    }),
  },
}))

export const procurementRelations = defineRelationsPart(schema, (r) => ({
  supplier: {
    purchaseOrders: r.many.purchaseOrder({ from: r.supplier.id, to: r.purchaseOrder.supplierId }),
    invoices: r.many.supplierInvoice({ from: r.supplier.id, to: r.supplierInvoice.supplierId }),
    defectTickets: r.many.defectTicket({ from: r.supplier.id, to: r.defectTicket.contractorId }),
  },
  purchaseRequest: {
    project: r.one.project({ from: r.purchaseRequest.projectId, to: r.project.id, optional: false }),
    requestedBy: r.one.user({ from: r.purchaseRequest.requestedById, to: r.user.id }),
    approvedBy: r.one.user({ from: r.purchaseRequest.approvedById, to: r.user.id }),
    items: r.many.purchaseRequestItem({ from: r.purchaseRequest.id, to: r.purchaseRequestItem.purchaseRequestId }),
    purchaseOrders: r.many.purchaseOrder({ from: r.purchaseRequest.id, to: r.purchaseOrder.purchaseRequestId }),
  },
  purchaseRequestItem: {
    purchaseRequest: r.one.purchaseRequest({
      from: r.purchaseRequestItem.purchaseRequestId,
      to: r.purchaseRequest.id,
      optional: false,
    }),
    budgetLine: r.one.budgetLine({ from: r.purchaseRequestItem.budgetLineId, to: r.budgetLine.id }),
    orderItems: r.many.purchaseOrderItem({
      from: r.purchaseRequestItem.id,
      to: r.purchaseOrderItem.purchaseRequestItemId,
    }),
  },
  purchaseOrder: {
    project: r.one.project({ from: r.purchaseOrder.projectId, to: r.project.id, optional: false }),
    supplier: r.one.supplier({ from: r.purchaseOrder.supplierId, to: r.supplier.id, optional: false }),
    purchaseRequest: r.one.purchaseRequest({ from: r.purchaseOrder.purchaseRequestId, to: r.purchaseRequest.id }),
    createdBy: r.one.user({ from: r.purchaseOrder.createdById, to: r.user.id }),
    approvedBy: r.one.user({ from: r.purchaseOrder.approvedById, to: r.user.id }),
    items: r.many.purchaseOrderItem({ from: r.purchaseOrder.id, to: r.purchaseOrderItem.purchaseOrderId }),
    goodsReceipts: r.many.goodsReceipt({ from: r.purchaseOrder.id, to: r.goodsReceipt.purchaseOrderId }),
    invoices: r.many.supplierInvoice({ from: r.purchaseOrder.id, to: r.supplierInvoice.purchaseOrderId }),
    attachments: r.many.attachment({
      from: r.purchaseOrder.id,
      to: r.attachment.entityId,
      where: { entityType: "purchase_order" },
    }),
  },
  purchaseOrderItem: {
    purchaseOrder: r.one.purchaseOrder({
      from: r.purchaseOrderItem.purchaseOrderId,
      to: r.purchaseOrder.id,
      optional: false,
    }),
    purchaseRequestItem: r.one.purchaseRequestItem({
      from: r.purchaseOrderItem.purchaseRequestItemId,
      to: r.purchaseRequestItem.id,
    }),
    budgetLine: r.one.budgetLine({ from: r.purchaseOrderItem.budgetLineId, to: r.budgetLine.id }),
    receiptItems: r.many.goodsReceiptItem({ from: r.purchaseOrderItem.id, to: r.goodsReceiptItem.purchaseOrderItemId }),
  },
  goodsReceipt: {
    purchaseOrder: r.one.purchaseOrder({
      from: r.goodsReceipt.purchaseOrderId,
      to: r.purchaseOrder.id,
      optional: false,
    }),
    receivedBy: r.one.user({ from: r.goodsReceipt.receivedById, to: r.user.id }),
    items: r.many.goodsReceiptItem({ from: r.goodsReceipt.id, to: r.goodsReceiptItem.goodsReceiptId }),
    attachments: r.many.attachment({
      from: r.goodsReceipt.id,
      to: r.attachment.entityId,
      where: { entityType: "goods_receipt" },
    }),
  },
  goodsReceiptItem: {
    goodsReceipt: r.one.goodsReceipt({
      from: r.goodsReceiptItem.goodsReceiptId,
      to: r.goodsReceipt.id,
      optional: false,
    }),
    purchaseOrderItem: r.one.purchaseOrderItem({
      from: r.goodsReceiptItem.purchaseOrderItemId,
      to: r.purchaseOrderItem.id,
      optional: false,
    }),
  },
  supplierInvoice: {
    supplier: r.one.supplier({ from: r.supplierInvoice.supplierId, to: r.supplier.id, optional: false }),
    purchaseOrder: r.one.purchaseOrder({ from: r.supplierInvoice.purchaseOrderId, to: r.purchaseOrder.id }),
    project: r.one.project({ from: r.supplierInvoice.projectId, to: r.project.id }),
    approvedBy: r.one.user({ from: r.supplierInvoice.approvedById, to: r.user.id }),
    payments: r.many.supplierPayment({ from: r.supplierInvoice.id, to: r.supplierPayment.supplierInvoiceId }),
    attachments: r.many.attachment({
      from: r.supplierInvoice.id,
      to: r.attachment.entityId,
      where: { entityType: "supplier_invoice" },
    }),
  },
  supplierPayment: {
    invoice: r.one.supplierInvoice({
      from: r.supplierPayment.supplierInvoiceId,
      to: r.supplierInvoice.id,
      optional: false,
    }),
    paidBy: r.one.user({ from: r.supplierPayment.paidById, to: r.user.id }),
  },
}))

export const aftersalesRelations = defineRelationsPart(schema, (r) => ({
  handover: {
    contract: r.one.salesContract({ from: r.handover.contractId, to: r.salesContract.id, optional: false }),
    inspector: r.one.user({ from: r.handover.inspectorId, to: r.user.id }),
    defectTickets: r.many.defectTicket({ from: r.handover.id, to: r.defectTicket.handoverId }),
    attachments: r.many.attachment({
      from: r.handover.id,
      to: r.attachment.entityId,
      where: { entityType: "handover" },
    }),
  },
  defectTicket: {
    unit: r.one.unit({ from: r.defectTicket.unitId, to: r.unit.id, optional: false }),
    contract: r.one.salesContract({ from: r.defectTicket.contractId, to: r.salesContract.id }),
    handover: r.one.handover({ from: r.defectTicket.handoverId, to: r.handover.id }),
    reportedBy: r.one.contact({ from: r.defectTicket.reportedById, to: r.contact.id }),
    assignedTo: r.one.user({ from: r.defectTicket.assignedToId, to: r.user.id }),
    contractor: r.one.supplier({ from: r.defectTicket.contractorId, to: r.supplier.id }),
    attachments: r.many.attachment({
      from: r.defectTicket.id,
      to: r.attachment.entityId,
      where: { entityType: "defect_ticket" },
    }),
  },
}))

export const documentsRelations = defineRelationsPart(schema, (r) => ({
  attachment: {
    uploadedBy: r.one.user({ from: r.attachment.uploadedById, to: r.user.id }),
  },
  activityLog: {
    user: r.one.user({ from: r.activityLog.userId, to: r.user.id }),
  },
}))

/**
 * Pass this to drizzle(). Base first, Better Auth's part last.
 *
 * Empty base part (defineRelationsPart(schema)): registers every table for autocomplete.
 */
export const relations = {
  ...defineRelationsPart(schema),
  ...projectsRelations,
  ...inventoryRelations,
  ...crmRelations,
  ...salesRelations,
  ...budgetRelations,
  ...procurementRelations,
  ...aftersalesRelations,
  ...documentsRelations,
  ...authRelations,
}
