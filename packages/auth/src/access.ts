/**
 * Departments (Better Auth teams) and the areas of the app each one works in. This decides both the sidebar
 * and API access: being in the Sales & Marketing team is what lets you use Sales.
 *
 * Owner and admin can use every area. Executive & Management can too, since it oversees everything.
 * Pure (no database), so the server, the proxy and the browser all share it.
 */
import { isOwnerOrAdmin } from "./permissions"

/** The fixed departments every organization gets, created as teams when the org is created. */
export const departments = [
  { code: "MGT", name: "Executive & Management" },
  { code: "SM", name: "Sales & Marketing" },
  { code: "CON", name: "Project & Construction" },
  { code: "ENG", name: "Engineering & Design" },
  { code: "PM", name: "Property Management" },
  { code: "PUR", name: "Procurement" },
  { code: "ACC", name: "Accounting & Finance" },
  { code: "HR", name: "HR & Admin" },
] as const

export type DepartmentCode = (typeof departments)[number]["code"]

export const isDepartmentCode = (code: string | null | undefined): code is DepartmentCode =>
  departments.some((d) => d.code === code)

/**
 * Areas of the app (one sidebar tab each) and the departments that work in them.
 * "everyone" areas are open to every member.
 */
export const areaDepartments = {
  executive: ["MGT"],
  projects: "everyone",
  construction: ["CON"],
  engineering: ["ENG"],
  sales: ["SM"],
  // Construction and engineering raise purchase requests; procurement turns them into orders
  procurement: ["PUR", "CON", "ENG"],
  accounting: ["ACC"],
  property: ["PM"],
  admin: ["HR"],
} as const satisfies Record<string, readonly DepartmentCode[] | "everyone">

export type Area = keyof typeof areaDepartments

export const allAreas = Object.keys(areaDepartments) as Area[]

/** What a member can reach: from their role (owner/admin) and their department teams. */
export type Access = { role: string | null; departments: DepartmentCode[] }

export function areasFor(access: Access): Area[] {
  if (isOwnerOrAdmin(access.role) || access.departments.includes("MGT")) return allAreas
  return allAreas.filter((area) => {
    const allowed: readonly DepartmentCode[] | "everyone" = areaDepartments[area]
    return allowed === "everyone" || allowed.some((code) => access.departments.includes(code))
  })
}

export const canUseArea = (access: Access, area: Area) => areasFor(access).includes(area)
