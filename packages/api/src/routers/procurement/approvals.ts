import type { DepartmentCode } from "@real-estate-management/auth/access"
import { team, user } from "@real-estate-management/db/schema/auth"
import { project, purchaseOrder, purchaseRequest, supplier } from "@real-estate-management/db/schema/index"
import { roleCan } from "@real-estate-management/auth/permissions"
import { and, asc, eq } from "drizzle-orm"

import { router } from "../../index"
import { decidePoAction, decidePrAction } from "../../lib/procurement-rules"
import { actorOf, loadMembers, procurementProcedure } from "./shared"

export const approvalsRouter = router({
  /**
   * Requests and orders waiting on the current user at their step: managers see the manager step for their
   * team (admins for every team), the owner sees the owner step. Uses the same rules as approve.
   */
  inbox: procurementProcedure.query(async ({ ctx }) => {
    if (!roleCan(ctx.access.role, { purchase: ["approve"] })) return { requests: [], orders: [], count: 0 }

    const actor = actorOf(ctx)
    const [members, requests, orders] = await Promise.all([
      loadMembers(ctx.db, ctx.orgId),
      ctx.db
        .select({
          id: purchaseRequest.id,
          prNumber: purchaseRequest.prNumber,
          approvalStep: purchaseRequest.approvalStep,
          estimatedTotal: purchaseRequest.estimatedTotal,
          neededBy: purchaseRequest.neededBy,
          justification: purchaseRequest.justification,
          requestedById: purchaseRequest.requestedById,
          waitingSince: purchaseRequest.updatedAt,
          projectName: project.name,
          departmentCode: team.code,
          departmentName: team.name,
          requesterName: user.name,
        })
        .from(purchaseRequest)
        .innerJoin(project, eq(project.id, purchaseRequest.projectId))
        .leftJoin(team, eq(team.id, purchaseRequest.departmentId))
        .leftJoin(user, eq(user.id, purchaseRequest.requestedById))
        .where(and(eq(purchaseRequest.organizationId, ctx.orgId), eq(purchaseRequest.status, "submitted")))
        .orderBy(asc(purchaseRequest.updatedAt)),
      ctx.db
        .select({
          id: purchaseOrder.id,
          poNumber: purchaseOrder.poNumber,
          approvalStep: purchaseOrder.approvalStep,
          total: purchaseOrder.total,
          orderDate: purchaseOrder.orderDate,
          createdById: purchaseOrder.createdById,
          waitingSince: purchaseOrder.updatedAt,
          projectName: project.name,
          supplierName: supplier.name,
          creatorName: user.name,
        })
        .from(purchaseOrder)
        .innerJoin(project, eq(project.id, purchaseOrder.projectId))
        .innerJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
        .leftJoin(user, eq(user.id, purchaseOrder.createdById))
        .where(and(eq(purchaseOrder.organizationId, ctx.orgId), eq(purchaseOrder.status, "pending_approval")))
        .orderBy(asc(purchaseOrder.updatedAt)),
    ])

    const myRequests = requests.filter(
      (r) =>
        decidePrAction({
          pr: {
            status: "submitted",
            requesterId: r.requestedById,
            department: r.departmentCode as DepartmentCode | null,
            approvalStep: r.approvalStep,
            lineCount: 1,
          },
          action: "approve",
          actor,
          members,
        }).ok,
    )
    const myOrders = orders.filter(
      (o) =>
        decidePoAction({
          po: {
            status: "pending_approval",
            creatorId: o.createdById,
            approvalStep: o.approvalStep,
            lineCount: 1,
            hasReceipts: false,
          },
          action: "approve",
          actor,
          members,
        }).ok,
    )
    return { requests: myRequests, orders: myOrders, count: myRequests.length + myOrders.length }
  }),
})
