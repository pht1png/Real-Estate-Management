import { team } from "@real-estate-management/db/schema/auth"
import { budgetLine, project, purchaseRequest, supplier } from "@real-estate-management/db/schema/index"
import { and, asc, eq, isNotNull } from "drizzle-orm"

import { router } from "../../index"
import { canRequestFor, isProcurementStaff } from "../../lib/procurement-rules"
import { actorOf, procurementProcedure, requestVisibility } from "./shared"
import type { DepartmentCode } from "@real-estate-management/auth/access"

/** Everything the procurement forms need for their dropdowns, in one request. */
export const optionsRouter = router({
  form: procurementProcedure.query(async ({ ctx }) => {
    const org = ctx.orgId
    const actor = actorOf(ctx)
    const staff = isProcurementStaff(actor)
    const [projects, departments, suppliers, budgetLines, approvedRequests] = await Promise.all([
      ctx.db
        .select({ id: project.id, name: project.name, code: project.code })
        .from(project)
        .where(eq(project.organizationId, org))
        .orderBy(asc(project.name)),
      ctx.db
        .select({ id: team.id, code: team.code, name: team.name })
        .from(team)
        .where(and(eq(team.organizationId, org), isNotNull(team.code)))
        .orderBy(asc(team.name)),
      ctx.db
        .select({
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          isSubcontractor: supplier.isSubcontractor,
          paymentTermDays: supplier.paymentTermDays,
        })
        .from(supplier)
        .where(and(eq(supplier.organizationId, org), eq(supplier.isActive, true)))
        .orderBy(asc(supplier.name)),
      ctx.db
        .select({
          id: budgetLine.id,
          projectId: budgetLine.projectId,
          code: budgetLine.code,
          name: budgetLine.name,
        })
        .from(budgetLine)
        .where(eq(budgetLine.organizationId, org))
        .orderBy(asc(budgetLine.code)),
      // Approved, not yet ordered: what Procurement can turn into a PO
      staff
        ? ctx.db
            .select({
              id: purchaseRequest.id,
              prNumber: purchaseRequest.prNumber,
              projectId: purchaseRequest.projectId,
              estimatedTotal: purchaseRequest.estimatedTotal,
              justification: purchaseRequest.justification,
            })
            .from(purchaseRequest)
            .where(
              and(
                eq(purchaseRequest.organizationId, org),
                eq(purchaseRequest.status, "approved"),
                await requestVisibility(ctx.db, org, actor),
              ),
            )
            .orderBy(asc(purchaseRequest.prNumber))
        : Promise.resolve([]),
    ])

    return {
      projects,
      /** Departments the current member can raise a request for. */
      departments: departments.filter((d) => canRequestFor(actor, d.code as DepartmentCode)),
      suppliers,
      budgetLines,
      approvedRequests,
    }
  }),
})
