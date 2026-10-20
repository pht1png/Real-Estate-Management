import {
  contact,
  lead,
  team,
  teamMember,
  project,
  salesContract,
  unit,
  unitType,
  user,
} from "@real-estate-management/db/schema/index"
import { and, asc, eq, inArray } from "drizzle-orm"

import { router } from "../../index"
import { contactName, salesOrAccounting } from "./shared"

/** Everything the sales forms need for their dropdowns, in one request. */
export const optionsRouter = router({
  form: salesOrAccounting.query(async ({ ctx }) => {
    const org = ctx.orgId
    const [projects, unitTypes, availableUnits, contacts, openLeads, members, activeContracts] = await Promise.all([
      ctx.db
        .select({ id: project.id, name: project.name, code: project.code })
        .from(project)
        .where(eq(project.organizationId, org))
        .orderBy(asc(project.name)),
      ctx.db
        .select({ id: unitType.id, name: unitType.name, projectId: unitType.projectId })
        .from(unitType)
        .where(eq(unitType.organizationId, org))
        .orderBy(asc(unitType.name)),
      ctx.db
        .select({
          id: unit.id,
          unitNumber: unit.unitNumber,
          projectId: unit.projectId,
          listPrice: unit.listPrice,
          unitTypeName: unitType.name,
        })
        .from(unit)
        .leftJoin(unitType, eq(unitType.id, unit.unitTypeId))
        .where(and(eq(unit.organizationId, org), eq(unit.status, "available")))
        .orderBy(asc(unit.unitNumber)),
      ctx.db
        .select({ id: contact.id, name: contactName, phone: contact.phone })
        .from(contact)
        .where(eq(contact.organizationId, org))
        .orderBy(contactName),
      ctx.db
        .select({ id: lead.id, contactId: lead.contactId, projectId: lead.projectId, status: lead.status })
        .from(lead)
        .where(and(eq(lead.organizationId, org), inArray(lead.status, ["new", "contacted", "visited", "negotiating"]))),
      // Salespeople: everyone in the Sales & Marketing team
      ctx.db
        .selectDistinct({ id: user.id, name: user.name })
        .from(teamMember)
        .innerJoin(team, eq(team.id, teamMember.teamId))
        .innerJoin(user, eq(user.id, teamMember.userId))
        .where(and(eq(team.organizationId, org), eq(team.code, "SM")))
        .orderBy(asc(user.name)),
      ctx.db
        .select({ id: salesContract.id, contractNumber: salesContract.contractNumber, buyerName: contactName })
        .from(salesContract)
        .innerJoin(contact, eq(contact.id, salesContract.buyerId))
        .where(and(eq(salesContract.organizationId, org), eq(salesContract.status, "active")))
        .orderBy(asc(salesContract.contractNumber)),
    ])

    return { projects, unitTypes, availableUnits, contacts, openLeads, members, activeContracts }
  }),
})
