/**
 * Seeds realistic demo data for one organization: projects, units, CRM, sales, budget,
 * procurement and after-sales. Uses the org's existing members as salespeople, purchasers, etc.
 *
 *   bun run seed:data            # refuses if the org already has projects
 *   bun run seed:data --reset    # wipes the org's domain data first (keeps users and members)
 */
import * as s from "@real-estate-management/db/schema/index"
import { eq, sql } from "drizzle-orm"
import type { PgInsertValue, PgTable } from "drizzle-orm/pg-core"

import { db } from "../src/services"

const ORGANIZATION_ID = "sxtRV5ZTEjA23MamPWbc5WbUlAbXiJkQ"
const RESET = process.argv.includes("--reset")

// ─── Helpers ────────────────────────────────────────────────────────────────

// Seeded PRNG (mulberry32) so every run produces the same data
let seed = 20261019
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)] as T
const chance = (p: number) => rand() < p
const shuffle = <T>(items: readonly T[]) => [...items].sort(() => rand() - 0.5)
const uid = () => crypto.randomUUID()
const money = (n: number) => n.toFixed(2)
const round = (n: number, to: number) => Math.round(n / to) * to
const pad = (n: number, width: number) => String(n).padStart(width, "0")

const DAY = 86_400_000
const now = new Date()
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY)
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY)
const addMonths = (d: Date, months: number) => {
  const next = new Date(d)
  next.setMonth(next.getMonth() + months)
  return next
}
const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

const counters: Record<string, number> = {}
const nextNumber = (prefix: string, width = 4) => {
  counters[prefix] = (counters[prefix] ?? 0) + 1
  return `${prefix}-${pad(counters[prefix], width)}`
}

async function insert<T extends PgTable>(table: T, rows: PgInsertValue<T>[]) {
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(table).values(rows.slice(i, i + 100))
  }
}

const org = { organizationId: ORGANIZATION_ID }

// ─── Guard / reset ──────────────────────────────────────────────────────────

const [organization] = await db
  .select({ name: s.organization.name })
  .from(s.organization)
  .where(eq(s.organization.id, ORGANIZATION_ID))
if (!organization) throw new Error(`Organization ${ORGANIZATION_ID} not found`)

const existingProject = await db
  .select({ id: s.project.id })
  .from(s.project)
  .where(eq(s.project.organizationId, ORGANIZATION_ID))
  .limit(1)

if (existingProject.length && !RESET) {
  console.log(`"${organization.name}" already has data. Run with --reset to wipe it and seed again.`)
  process.exit(1)
}

if (RESET) {
  // Children before parents, because business references use NO ACTION
  const tables = [
    s.activityLog,
    s.attachment,
    s.defectTicket,
    s.handover,
    s.supplierPayment,
    s.supplierInvoice,
    s.goodsReceiptItem,
    s.goodsReceipt,
    s.purchaseOrderItem,
    s.purchaseOrder,
    s.purchaseRequestItem,
    s.purchaseRequest,
    s.supplier,
    s.expense,
    s.customerPayment,
    s.mortgageApplication,
    s.installment,
    s.salesContract,
    s.reservation,
    s.leadActivity,
    s.lead,
    s.contact,
    s.budgetLine,
    s.unit,
    s.unitType,
    s.projectPhase,
    s.project,
  ]
  for (const table of tables) {
    await db.execute(sql`delete from ${table} where organization_id = ${ORGANIZATION_ID}`)
  }
  console.log(`Wiped existing data for "${organization.name}"`)
}

// ─── Members ────────────────────────────────────────────────────────────────

const members = await db
  .select({ userId: s.member.userId, role: s.member.role })
  .from(s.member)
  .where(eq(s.member.organizationId, ORGANIZATION_ID))
if (!members.length) throw new Error("Organization has no members")

const everyone = members.map((m) => m.userId)
const withRole = (role: string) => {
  const ids = members.filter((m) => m.role.split(",").includes(role)).map((m) => m.userId)
  return ids.length ? ids : everyone
}
// People work in department teams: Sales & Marketing sells, Procurement buys
const teamRows = await db
  .select({ userId: s.teamMember.userId, code: s.team.code })
  .from(s.teamMember)
  .innerJoin(s.team, eq(s.team.id, s.teamMember.teamId))
  .where(eq(s.team.organizationId, ORGANIZATION_ID))
const inTeam = (code: string) => {
  const ids = [...new Set(teamRows.filter((t) => t.code === code).map((t) => t.userId))]
  return ids.length ? ids : everyone
}
const owners = withRole("owner")
const salespeople = inTeam("SM")
const purchasers = inTeam("PUR")
const managers = [...new Set([...owners, ...withRole("admin"), ...withRole("manager")])]

// ─── Projects, phases, unit types, units ───────────────────────────────────

type UnitTypeDef = {
  code: string
  name: string
  bedrooms: number
  bathrooms: number
  parking: number
  areaSqm: number
  landSqw: number | null
  price: number
}

type ProjectDef = {
  code: string
  name: string
  type: "condominium" | "single_house" | "townhouse"
  status: "pre_sale" | "under_construction" | "completed"
  description: string
  subdistrict: string
  district: string
  province: string
  postalCode: string
  latitude: string
  longitude: string
  landAreaSqw: string
  launchedDaysAgo: number
  completionMonths: number
  phases: string[]
  unitTypes: UnitTypeDef[]
  reservations: number
  downPaymentPct: number
  downPaymentMonths: number
  contractPayment: number
  reservationFee: number
  leads: number
}

const projectDefs: ProjectDef[] = [
  {
    code: "RSC",
    name: "The Riverside Condo",
    type: "condominium",
    status: "under_construction",
    description: "Two 8-storey low-rise buildings by the Chao Phraya, 5 minutes from MRT Bang Pho.",
    subdistrict: "Bang Sue",
    district: "Bang Sue",
    province: "Bangkok",
    postalCode: "10800",
    latitude: "13.806100",
    longitude: "100.521900",
    landAreaSqw: "1800.00",
    launchedDaysAgo: 420,
    completionMonths: 10,
    phases: ["Building A", "Building B"],
    unitTypes: [
      {
        code: "ST",
        name: "Studio",
        bedrooms: 0,
        bathrooms: 1,
        parking: 0,
        areaSqm: 26,
        landSqw: null,
        price: 2_390_000,
      },
      {
        code: "1BR",
        name: "1 Bedroom",
        bedrooms: 1,
        bathrooms: 1,
        parking: 0,
        areaSqm: 34,
        landSqw: null,
        price: 3_290_000,
      },
      {
        code: "2BR",
        name: "2 Bedroom",
        bedrooms: 2,
        bathrooms: 2,
        parking: 1,
        areaSqm: 56,
        landSqw: null,
        price: 5_490_000,
      },
    ],
    reservations: 16,
    downPaymentPct: 0.15,
    downPaymentMonths: 12,
    contractPayment: 50_000,
    reservationFee: 20_000,
    leads: 28,
  },
  {
    code: "GVB",
    name: "Green Ville Bangna",
    type: "single_house",
    status: "pre_sale",
    description: "Detached family homes on Bangna-Trad km. 15 with a central park and clubhouse.",
    subdistrict: "Bang Phli Yai",
    district: "Bang Phli",
    province: "Samut Prakan",
    postalCode: "10540",
    latitude: "13.627400",
    longitude: "100.712300",
    landAreaSqw: "6400.00",
    launchedDaysAgo: 120,
    completionMonths: 18,
    phases: ["Phase 1", "Phase 2"],
    unitTypes: [
      {
        code: "H3",
        name: "Willow – 3 bed",
        bedrooms: 3,
        bathrooms: 3,
        parking: 2,
        areaSqm: 150,
        landSqw: 60,
        price: 5_900_000,
      },
      {
        code: "H4",
        name: "Oak – 4 bed",
        bedrooms: 4,
        bathrooms: 4,
        parking: 2,
        areaSqm: 210,
        landSqw: 80,
        price: 8_500_000,
      },
    ],
    reservations: 8,
    downPaymentPct: 0.05,
    downPaymentMonths: 6,
    contractPayment: 100_000,
    reservationFee: 50_000,
    leads: 16,
  },
  {
    code: "UTR",
    name: "Urban Town Ratchapruek",
    type: "townhouse",
    status: "completed",
    description: "Modern 2- and 3-storey townhomes on Ratchapruek Road, ready to move in.",
    subdistrict: "Bang Rak Noi",
    district: "Mueang Nonthaburi",
    province: "Nonthaburi",
    postalCode: "11000",
    latitude: "13.865800",
    longitude: "100.466900",
    landAreaSqw: "2100.00",
    launchedDaysAgo: 600,
    completionMonths: -6,
    phases: ["Phase 1"],
    unitTypes: [
      {
        code: "T2",
        name: "Urban 2-storey",
        bedrooms: 3,
        bathrooms: 2,
        parking: 1,
        areaSqm: 120,
        landSqw: 18,
        price: 3_200_000,
      },
      {
        code: "T3",
        name: "Urban Corner 3-storey",
        bedrooms: 4,
        bathrooms: 3,
        parking: 2,
        areaSqm: 160,
        landSqw: 24,
        price: 4_500_000,
      },
    ],
    reservations: 11,
    downPaymentPct: 0.05,
    downPaymentMonths: 4,
    contractPayment: 50_000,
    reservationFee: 30_000,
    leads: 16,
  },
]

type UnitRow = PgInsertValue<typeof s.unit> & { id: string; listPrice: string; projectId: string }

const projects: PgInsertValue<typeof s.project>[] = []
const phases: PgInsertValue<typeof s.projectPhase>[] = []
const unitTypes: (PgInsertValue<typeof s.unitType> & { id: string })[] = []
const units: UnitRow[] = []
const projectIds: Record<string, string> = {}
const unitTypeIdsByProject: Record<string, string[]> = {}

const facings = ["North", "South", "East", "West"] as const

for (const def of projectDefs) {
  const projectId = uid()
  projectIds[def.code] = projectId
  const launch = daysAgo(def.launchedDaysAgo)
  projects.push({
    id: projectId,
    ...org,
    code: def.code,
    name: def.name,
    slug: def.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    type: def.type,
    status: def.status,
    description: def.description,
    subdistrict: def.subdistrict,
    district: def.district,
    province: def.province,
    postalCode: def.postalCode,
    addressLine: `${int(10, 199)}/${int(1, 9)} Moo ${int(1, 12)}`,
    latitude: def.latitude,
    longitude: def.longitude,
    landAreaSqw: def.landAreaSqw,
    launchDate: dateOnly(launch),
    expectedCompletionDate: dateOnly(addMonths(now, def.completionMonths)),
  })

  const phaseIds = def.phases.map((name, i) => {
    const id = uid()
    phases.push({
      id,
      ...org,
      projectId,
      name,
      sortOrder: i,
      startDate: dateOnly(addMonths(launch, i * 6)),
      endDate: dateOnly(addMonths(now, def.completionMonths + i * 6)),
    })
    return id
  })

  const typeIds: Record<string, string> = {}
  for (const t of def.unitTypes) {
    const id = uid()
    typeIds[t.code] = id
    unitTypes.push({
      id,
      ...org,
      projectId,
      code: t.code,
      name: t.name,
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      parkingSpaces: t.parking,
      usableAreaSqm: money(t.areaSqm),
      landAreaSqw: t.landSqw === null ? null : money(t.landSqw),
      basePrice: money(t.price),
      description: `${t.bedrooms || "Studio"}${t.bedrooms ? " bed" : ""}, ${t.bathrooms} bath, ${t.areaSqm} m²`,
    })
  }
  unitTypeIdsByProject[def.code] = Object.values(typeIds)

  const typeByCode = (code: string) => def.unitTypes.find((t) => t.code === code) as UnitTypeDef
  const addUnit = (
    unitNumber: string,
    typeCode: string,
    phaseId: string,
    floor: number | null,
    price: number,
    landSqw: number | null,
    houseNumber: string | null = null,
  ) => {
    const t = typeByCode(typeCode)
    units.push({
      id: uid(),
      ...org,
      projectId,
      phaseId,
      unitTypeId: typeIds[typeCode],
      unitNumber,
      houseNumber,
      floor,
      facing: def.type === "condominium" && chance(0.25) ? "River view" : pick(facings),
      usableAreaSqm: money(t.areaSqm),
      landAreaSqw: landSqw === null ? null : money(landSqw),
      listPrice: money(price),
      status: "available",
    })
  }

  if (def.type === "condominium") {
    def.phases.forEach((_, phaseIndex) => {
      const building = String.fromCharCode(65 + phaseIndex)
      for (let floor = 2; floor <= 6; floor++) {
        for (let room = 1; room <= 4; room++) {
          const typeCode = room === 1 ? "2BR" : room === 4 ? "ST" : "1BR"
          const price = round(typeByCode(typeCode).price * (1 + (floor - 2) * 0.015), 10_000)
          addUnit(`${building}-${floor}0${room}`, typeCode, phaseIds[phaseIndex] as string, floor, price, null)
        }
      }
    })
  } else if (def.type === "single_house") {
    const plotsPerPhase = [12, 8]
    plotsPerPhase.forEach((count, phaseIndex) => {
      for (let n = 1; n <= count; n++) {
        const typeCode = n % 4 === 0 ? "H4" : "H3"
        const t = typeByCode(typeCode)
        const extraSqw = int(0, 15)
        addUnit(
          `P${phaseIndex + 1}-${pad(n, 2)}`,
          typeCode,
          phaseIds[phaseIndex] as string,
          null,
          round(t.price + extraSqw * 45_000, 10_000),
          (t.landSqw ?? 0) + extraSqw,
        )
      }
    })
  } else {
    for (let n = 1; n <= 16; n++) {
      const typeCode = [1, 8, 9, 16].includes(n) ? "T3" : "T2"
      const t = typeByCode(typeCode)
      // Built houses have their บ้านเลขที่ from the district office; unbuilt ones get it later
      const houseNumber = def.status === "completed" ? `199/${n + 40}` : null
      addUnit(`T-${pad(n, 2)}`, typeCode, phaseIds[0] as string, null, t.price, t.landSqw, houseNumber)
    }
  }

}

const projectCodes = projectDefs.map((d) => d.code)

// ─── Budget ─────────────────────────────────────────────────────────────────

const budgetTemplate = [
  { code: "01-100", name: "Land acquisition", category: "land", share: 0.25 },
  { code: "02-100", name: "Architecture & engineering design", category: "design", share: 0.03 },
  { code: "03-100", name: "Permits & EIA", category: "permits", share: 0.01 },
  { code: "04-100", name: "Site works, roads & drainage", category: "infrastructure", share: 0.05 },
  { code: "05-100", name: "Structural works", category: "construction", share: 0.18 },
  { code: "05-200", name: "Architectural finishes", category: "construction", share: 0.1 },
  { code: "06-100", name: "Building materials", category: "materials", share: 0.08 },
  { code: "07-100", name: "Site labor", category: "labor", share: 0.06 },
  { code: "08-100", name: "Marketing & sales gallery", category: "marketing", share: 0.03 },
  { code: "09-100", name: "Project overhead", category: "overhead", share: 0.02 },
] as const

const budgetLines: PgInsertValue<typeof s.budgetLine>[] = []
const budgetLineId: Record<string, Record<string, string>> = {}

for (const def of projectDefs) {
  const projectId = projectIds[def.code] as string
  const projectValue = units.filter((u) => u.projectId === projectId).reduce((sum, u) => sum + Number(u.listPrice), 0)
  budgetLineId[def.code] = {}
  for (const line of budgetTemplate) {
    const id = uid()
    ;(budgetLineId[def.code] as Record<string, string>)[line.code] = id
    budgetLines.push({
      id,
      ...org,
      projectId,
      code: line.code,
      name: line.name,
      category: line.category,
      budgetAmount: money(round(projectValue * line.share, 10_000)),
    })
  }
}

// ─── Contacts & leads ───────────────────────────────────────────────────────

const firstNames = [
  "Somchai",
  "Somsak",
  "Suda",
  "Malee",
  "Niran",
  "Kittipong",
  "Pimchanok",
  "Waraporn",
  "Anan",
  "Thanawat",
  "Chanida",
  "Ratchanee",
  "Prasert",
  "Supaporn",
  "Nattapong",
  "Siriporn",
  "Wichai",
  "Kanokwan",
  "Jirayu",
  "Ploy",
]
const lastNames = [
  "Srisuk",
  "Wongsawat",
  "Chaiyaporn",
  "Rattanakul",
  "Boonmee",
  "Saetang",
  "Phromma",
  "Kaewkla",
  "Thongdee",
  "Jaidee",
  "Sukjai",
  "Charoenpol",
]
const companies = ["Siam Asset Holding Co., Ltd.", "Chao Phraya Trading Co., Ltd.", "Lanna Family Office Co., Ltd."]
const provinces = [
  { district: "Chatuchak", province: "Bangkok", postalCode: "10900" },
  { district: "Bang Kapi", province: "Bangkok", postalCode: "10240" },
  { district: "Pak Kret", province: "Nonthaburi", postalCode: "11120" },
  { district: "Mueang Samut Prakan", province: "Samut Prakan", postalCode: "10270" },
  { district: "Khlong Luang", province: "Pathum Thani", postalCode: "12120" },
] as const

const randomDigits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("")
const phone = () => `08${int(1, 9)}-${int(100, 999)}-${int(1000, 9999)}`

const contacts: (PgInsertValue<typeof s.contact> & { id: string })[] = []
for (let i = 0; i < 45; i++) {
  const place = pick(provinces)
  const isCompany = i < companies.length
  const first = pick(firstNames)
  const last = pick(lastNames)
  contacts.push({
    id: uid(),
    ...org,
    type: isCompany ? "company" : "individual",
    firstName: isCompany ? null : first,
    lastName: isCompany ? null : last,
    companyName: isCompany ? companies[i] : null,
    email: isCompany ? `contact${i}@example.com` : `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    phone: phone(),
    lineId: chance(0.7) ? `${first.toLowerCase()}${int(10, 99)}` : null,
    taxId: chance(0.6) ? randomDigits(13) : null,
    addressLine: `${int(1, 999)}/${int(1, 99)}`,
    district: place.district,
    province: place.province,
    postalCode: place.postalCode,
  })
}

type LeadRow = PgInsertValue<typeof s.lead> & { id: string; contactId: string; projectId: string }

const leadSources = ["walk_in", "website", "facebook", "line", "referral", "agent", "event"] as const
const openLeadStatuses = ["new", "contacted", "visited", "negotiating", "lost"] as const
const leads: LeadRow[] = []
let contactCursor = 0

for (const def of projectDefs) {
  const projectId = projectIds[def.code] as string
  for (let i = 0; i < def.leads; i++) {
    const contact = contacts[contactCursor++ % contacts.length] as (typeof contacts)[number]
    const typePrice = pick(def.unitTypes).price
    const status = pick(openLeadStatuses)
    leads.push({
      id: uid(),
      ...org,
      contactId: contact.id,
      projectId,
      interestedUnitTypeId: pick(unitTypeIdsByProject[def.code] as string[]),
      assignedToId: pick(salespeople),
      source: pick(leadSources),
      status,
      budgetMin: money(round(typePrice * 0.85, 100_000)),
      budgetMax: money(round(typePrice * 1.15, 100_000)),
      lostReason:
        status === "lost"
          ? pick(["Chose another project", "Budget too low", "Loan not approved", "No response"])
          : null,
    })
  }
}

// ─── Reservations, contracts, installments, payments, mortgages ────────────

type Outcome = "transferred" | "contract" | "draft" | "reserved" | "cancelled" | "expired"
const outcomeWeights: Record<ProjectDef["status"], [Outcome, number][]> = {
  completed: [
    ["transferred", 0.6],
    ["contract", 0.2],
    ["reserved", 0.1],
    ["cancelled", 0.1],
  ],
  under_construction: [
    ["contract", 0.5],
    ["draft", 0.1],
    ["reserved", 0.25],
    ["cancelled", 0.1],
    ["expired", 0.05],
  ],
  pre_sale: [
    ["contract", 0.3],
    ["reserved", 0.5],
    ["cancelled", 0.2],
  ],
}
const pickOutcome = (status: ProjectDef["status"]) => {
  let r = rand()
  for (const [outcome, weight] of outcomeWeights[status]) {
    r -= weight
    if (r <= 0) return outcome
  }
  return outcomeWeights[status][0]?.[0] as Outcome
}

const methods = ["bank_transfer", "bank_transfer", "promptpay", "cheque", "credit_card", "cash"] as const
const banks = ["Kasikornbank", "SCB", "Krungthai Bank", "Bangkok Bank", "Krungsri", "GH Bank", "TTB"] as const

const reservations: PgInsertValue<typeof s.reservation>[] = []
const contracts: (PgInsertValue<typeof s.salesContract> & { id: string; unitId: string; buyerId: string })[] = []
const installments: PgInsertValue<typeof s.installment>[] = []
const customerPayments: PgInsertValue<typeof s.customerPayment>[] = []
const mortgages: PgInsertValue<typeof s.mortgageApplication>[] = []
const handovers: (PgInsertValue<typeof s.handover> & { id: string })[] = []
const completedHandovers: { handoverId: string; contractId: string; unitId: string; buyerId: string; at: Date }[] = []

for (const def of projectDefs) {
  const projectId = projectIds[def.code] as string
  const projectUnits = shuffle(units.filter((u) => u.projectId === projectId)).slice(0, def.reservations)
  const projectLeads = shuffle(leads.filter((l) => l.projectId === projectId))

  projectUnits.forEach((unit, i) => {
    const outcome = pickOutcome(def.status)
    const lead = projectLeads[i] as LeadRow
    const listPrice = Number(unit.listPrice)
    const salespersonId = lead.assignedToId ?? pick(salespeople)

    const reservedAt =
      outcome === "transferred"
        ? daysAgo(int(330, 500))
        : outcome === "reserved"
          ? daysAgo(int(1, 20))
          : outcome === "cancelled" || outcome === "expired"
            ? daysAgo(int(60, 180))
            : daysAgo(int(30, 300))

    const reservationId = uid()
    reservations.push({
      id: reservationId,
      ...org,
      reservationNumber: nextNumber("RS"),
      unitId: unit.id,
      contactId: lead.contactId,
      leadId: lead.id,
      salespersonId,
      reservationFee: money(def.reservationFee),
      reservedAt,
      expiresAt: addDays(reservedAt, 30),
      status:
        outcome === "reserved"
          ? "active"
          : outcome === "cancelled"
            ? "cancelled"
            : outcome === "expired"
              ? "expired"
              : "converted",
      cancelReason:
        outcome === "cancelled" ? pick(["Customer changed mind", "Loan pre-approval failed", "Moved abroad"]) : null,
    })
    customerPayments.push({
      ...org,
      receiptNumber: nextNumber("RC", 5),
      payerId: lead.contactId,
      reservationId,
      amount: money(def.reservationFee),
      method: pick(methods),
      paidAt: reservedAt,
      recordedById: salespersonId,
    })

    lead.status =
      outcome === "reserved" ? "negotiating" : outcome === "cancelled" || outcome === "expired" ? "lost" : "won"
    lead.lostReason = lead.status === "lost" ? "Reservation cancelled" : null

    if (outcome === "reserved") {
      unit.status = "reserved"
      return
    }
    if (outcome === "cancelled" || outcome === "expired") return

    // Converted to a contract
    const contractId = uid()
    const contractDate = addDays(reservedAt, int(7, 14))
    const discount = pick([0, 0, 50_000, 100_000])
    const netPrice = listPrice - discount
    const downTotal = round(netPrice * def.downPaymentPct, 1_000)
    const scheduledTransfer = addMonths(contractDate, def.downPaymentMonths + 1)
    const transferDate = def.status === "completed" ? scheduledTransfer : addMonths(now, def.completionMonths + 1)
    const isTransferred = outcome === "transferred"

    contracts.push({
      id: contractId,
      ...org,
      contractNumber: nextNumber("SC"),
      unitId: unit.id,
      buyerId: lead.contactId,
      reservationId,
      contractDate: dateOnly(contractDate),
      salePrice: money(listPrice),
      discountAmount: money(discount),
      netPrice: money(netPrice),
      downPaymentAmount: money(downTotal),
      status: isTransferred ? "transferred" : outcome === "draft" ? "draft" : "active",
      scheduledTransferDate: dateOnly(transferDate),
      transferredOn: isTransferred ? dateOnly(transferDate) : null,
      createdById: salespersonId,
    })
    unit.status = isTransferred ? "transferred" : "contracted"

    // Payment schedule: contract payment → monthly down payments → transfer payment
    const monthly = (downTotal - def.contractPayment) / def.downPaymentMonths
    const schedule: { type: "contract_payment" | "down_payment" | "transfer_payment"; due: Date; amount: number }[] = [
      { type: "contract_payment", due: contractDate, amount: def.contractPayment },
      ...Array.from({ length: def.downPaymentMonths }, (_, m) => ({
        type: "down_payment" as const,
        due: addMonths(contractDate, m + 1),
        amount: monthly,
      })),
      { type: "transfer_payment", due: transferDate, amount: netPrice - downTotal - def.reservationFee },
    ]

    schedule.forEach((item, seq) => {
      const installmentId = uid()
      const isDue = item.due < now
      const paid = outcome !== "draft" && (isTransferred || (isDue && !(seq === schedule.length - 2 && chance(0.15))))
      const partial = !paid && isDue && outcome !== "draft" && chance(0.3)
      installments.push({
        id: installmentId,
        ...org,
        contractId,
        sequence: seq + 1,
        type: item.type,
        dueDate: dateOnly(item.due),
        amount: money(item.amount),
        status: paid ? "paid" : partial ? "partially_paid" : "pending",
      })
      if (paid || partial) {
        customerPayments.push({
          ...org,
          receiptNumber: nextNumber("RC", 5),
          payerId: lead.contactId,
          contractId,
          installmentId,
          amount: money(partial ? item.amount / 2 : item.amount),
          method: item.type === "transfer_payment" ? "bank_transfer" : pick(methods),
          paidAt: addDays(item.due, -int(0, 3)),
          bankReference: `TRX${randomDigits(10)}`,
          recordedById: pick(salespeople),
        })
      }
    })

    const transferAmount = netPrice - downTotal - def.reservationFee
    const monthsToTransfer = (transferDate.getTime() - now.getTime()) / (30 * DAY)
    if (isTransferred || monthsToTransfer < 4) {
      const submitted = addDays(transferDate, -60)
      const status = isTransferred ? "approved" : pick(["preparing", "submitted", "approved"] as const)
      mortgages.push({
        ...org,
        contractId,
        bankName: pick(banks),
        requestedAmount: money(transferAmount),
        approvedAmount: status === "approved" ? money(round(transferAmount * (0.95 + rand() * 0.05), 1_000)) : null,
        status,
        submittedOn: status === "preparing" ? null : dateOnly(submitted),
        decidedOn: status === "approved" ? dateOnly(addDays(submitted, int(14, 30))) : null,
      })
    }

    if (isTransferred) {
      const handoverId = uid()
      const at = addDays(transferDate, -int(7, 21))
      handovers.push({
        id: handoverId,
        ...org,
        contractId,
        scheduledAt: at,
        completedAt: at,
        status: "completed",
        inspectorId: pick(managers),
        customerSignedOff: true,
      })
      completedHandovers.push({ handoverId, contractId, unitId: unit.id, buyerId: lead.contactId, at })
    } else if (def.status === "completed") {
      handovers.push({
        id: uid(),
        ...org,
        contractId,
        scheduledAt: addDays(now, int(7, 30)),
        status: "scheduled",
        inspectorId: pick(managers),
      })
    }
  })
}

// A couple of units held back by management
for (const unit of shuffle(units.filter((u) => u.status === "available")).slice(0, 3)) unit.status = "on_hold"

const activitySummaries: Record<(typeof s.leadActivityType.enumValues)[number], string[]> = {
  call: ["Intro call, sent brochure", "Followed up on pricing", "Discussed promotion and free furniture package"],
  line_message: ["Sent floor plans via LINE", "Shared payment schedule", "Answered questions about common fees"],
  email: ["Emailed price list", "Sent loan pre-approval documents checklist"],
  site_visit: ["Visited show unit with family", "Toured site and sales gallery"],
  meeting: ["Met at sales gallery to discuss unit selection", "Negotiated discount with sales manager"],
  note: ["Interested in high floor, river view", "Waiting for bonus in December", "Prefers corner unit"],
}
const leadActivities: PgInsertValue<typeof s.leadActivity>[] = leads.flatMap((lead) =>
  Array.from({ length: lead.status === "new" ? 0 : int(1, 4) }, () => {
    const type = pick(s.leadActivityType.enumValues)
    return {
      ...org,
      leadId: lead.id,
      type,
      summary: pick(activitySummaries[type]),
      occurredAt: daysAgo(int(1, 200)),
      createdById: lead.assignedToId,
    }
  }),
)

// ─── Suppliers & procurement ────────────────────────────────────────────────

const supplierDefs = [
  { name: "Thai Concrete Supply Co., Ltd.", category: "Concrete & cement", sub: false, terms: 30 },
  { name: "Bangkok Steel Trading Co., Ltd.", category: "Steel", sub: false, terms: 45 },
  { name: "Siam Electrical & Plumbing Supply", category: "Electrical & plumbing", sub: false, terms: 30 },
  { name: "Chao Phraya Tiles & Paint", category: "Finishes", sub: false, terms: 30 },
  { name: "Northern Timber & Doors", category: "Doors & timber", sub: false, terms: 30 },
  { name: "ProPlumb Installation Services", category: "Plumbing works", sub: true, terms: 15 },
  { name: "Perfect Finish Painting", category: "Painting works", sub: true, terms: 15 },
  { name: "Green Garden Landscape", category: "Landscape works", sub: true, terms: 30 },
]

const suppliers = supplierDefs.map((d, i) => ({
  id: uid(),
  ...org,
  code: `SUP-${pad(i + 1, 3)}`,
  name: d.name,
  taxId: `0105${randomDigits(9)}`,
  category: d.category,
  isSubcontractor: d.sub,
  contactName: `${pick(firstNames)} ${pick(lastNames)}`,
  email: `sales${i + 1}@example.com`,
  phone: `02-${int(100, 999)}-${int(1000, 9999)}`,
  district: pick(provinces).district,
  province: "Bangkok",
  paymentTermDays: d.terms,
}))
const supplierAt = (i: number) => suppliers[i] as (typeof suppliers)[number]

// Materials grouped by supplier, so each PR/PO goes to one supplier
const catalog: {
  supplier: number
  description: string
  uom: string
  price: number
  budget: string
  qty: [number, number]
}[] = [
  { supplier: 0, description: "Ready-mix concrete 240 ksc", uom: "m³", price: 2_350, budget: "05-100", qty: [20, 120] },
  { supplier: 0, description: "Portland cement 50 kg", uom: "bag", price: 145, budget: "06-100", qty: [200, 800] },
  { supplier: 0, description: "Concrete block 7 cm", uom: "piece", price: 8, budget: "06-100", qty: [2_000, 8_000] },
  { supplier: 1, description: "Deformed bar DB16 SD40", uom: "ton", price: 24_500, budget: "05-100", qty: [5, 30] },
  { supplier: 1, description: "Round bar RB9 SR24", uom: "ton", price: 23_800, budget: "05-100", qty: [2, 10] },
  { supplier: 1, description: "Wire mesh 4 mm", uom: "sheet", price: 380, budget: "06-100", qty: [50, 300] },
  {
    supplier: 2,
    description: "THW cable 2.5 mm² (100 m)",
    uom: "roll",
    price: 1_850,
    budget: "06-100",
    qty: [20, 100],
  },
  { supplier: 2, description: 'PVC pipe 4" class 8.5', uom: "piece", price: 420, budget: "06-100", qty: [50, 250] },
  { supplier: 2, description: "Consumer unit 12-way", uom: "set", price: 2_900, budget: "06-100", qty: [10, 40] },
  {
    supplier: 3,
    description: "Porcelain floor tile 60×60",
    uom: "m²",
    price: 320,
    budget: "05-200",
    qty: [300, 1_500],
  },
  { supplier: 3, description: "Exterior acrylic paint", uom: "gallon", price: 1_650, budget: "05-200", qty: [40, 200] },
  { supplier: 3, description: "Wall tile 30×60", uom: "m²", price: 280, budget: "05-200", qty: [200, 900] },
  {
    supplier: 4,
    description: "Engineered wood door with frame",
    uom: "set",
    price: 6_800,
    budget: "05-200",
    qty: [20, 80],
  },
  {
    supplier: 4,
    description: "Aluminium sliding window 1.2 m",
    uom: "set",
    price: 4_200,
    budget: "05-200",
    qty: [20, 90],
  },
]

const services = [
  { supplier: 5, description: "Sanitary & plumbing installation", budget: "07-100", amount: [380_000, 900_000] },
  { supplier: 6, description: "Interior & exterior painting works", budget: "07-100", amount: [450_000, 1_200_000] },
  { supplier: 7, description: "Common area landscaping", budget: "04-100", amount: [600_000, 1_500_000] },
] as const

const purchaseRequests: PgInsertValue<typeof s.purchaseRequest>[] = []
const prItems: (PgInsertValue<typeof s.purchaseRequestItem> & { id: string; description: string; quantity: string })[] =
  []
const purchaseOrders: PgInsertValue<typeof s.purchaseOrder>[] = []
const poItems: PgInsertValue<typeof s.purchaseOrderItem>[] = []
const goodsReceipts: PgInsertValue<typeof s.goodsReceipt>[] = []
const grItems: PgInsertValue<typeof s.goodsReceiptItem>[] = []
const supplierInvoices: PgInsertValue<typeof s.supplierInvoice>[] = []
const supplierPayments: PgInsertValue<typeof s.supplierPayment>[] = []

const prStatuses = [
  ...Array<"ordered">(8).fill("ordered"),
  "approved",
  "approved",
  "submitted",
  "draft",
  "rejected",
] as const
const poStatuses = [
  "received",
  "received",
  "closed",
  "closed",
  "partially_received",
  "sent",
  "approved",
  "pending_approval",
] as const
const activeProjectCodes = ["RSC", "RSC", "GVB", "GVB", "UTR"] as const

type PoLine = {
  description: string
  uom: string
  quantity: number
  unitPrice: number
  budgetLineId: string
  prItemId?: string
}

function createPurchaseOrder(opts: {
  projectCode: string
  supplierIndex: number
  purchaseRequestId: string | null
  status: (typeof s.purchaseOrderStatus.enumValues)[number]
  orderDate: Date
  lines: PoLine[]
  whtRate: number
}) {
  const poId = uid()
  const supplier = supplierAt(opts.supplierIndex)
  const subtotal = opts.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)
  const discount = chance(0.3) ? round(subtotal * 0.02, 1) : 0
  const vat = (subtotal - discount) * 0.07
  const total = subtotal - discount + vat
  const isApproved = opts.status !== "draft" && opts.status !== "pending_approval"
  const approver = pick(owners)

  purchaseOrders.push({
    id: poId,
    ...org,
    poNumber: nextNumber("PO"),
    projectId: projectIds[opts.projectCode] as string,
    supplierId: supplier.id,
    purchaseRequestId: opts.purchaseRequestId,
    status: opts.status,
    orderDate: dateOnly(opts.orderDate),
    expectedDeliveryDate: dateOnly(addDays(opts.orderDate, int(7, 21))),
    deliveryAddress: `${projectDefs.find((d) => d.code === opts.projectCode)?.name} site office`,
    subtotal: money(subtotal),
    discountAmount: money(discount),
    vatRate: "7.00",
    vatAmount: money(vat),
    whtRate: money(opts.whtRate),
    total: money(total),
    createdById: pick(purchasers),
    approvedById: isApproved ? approver : null,
    approvedAt: isApproved ? addDays(opts.orderDate, 1) : null,
  })

  const lineIds = opts.lines.map((line, i) => {
    const id = uid()
    poItems.push({
      id,
      ...org,
      purchaseOrderId: poId,
      purchaseRequestItemId: line.prItemId ?? null,
      budgetLineId: line.budgetLineId,
      description: line.description,
      quantity: line.quantity.toFixed(3),
      unitOfMeasure: line.uom,
      unitPrice: money(line.unitPrice),
      sortOrder: i,
    })
    return id
  })

  if (opts.status === "received" || opts.status === "closed" || opts.status === "partially_received") {
    const grId = uid()
    const receivedOn = addDays(opts.orderDate, int(5, 20))
    goodsReceipts.push({
      id: grId,
      ...org,
      grNumber: nextNumber("GR"),
      purchaseOrderId: poId,
      receivedOn: dateOnly(receivedOn),
      receivedById: pick(purchasers),
      deliveryNoteNumber: `DN${randomDigits(6)}`,
    })
    opts.lines.forEach((line, i) => {
      const partial = opts.status === "partially_received"
      const rejected = !partial && chance(0.15) ? Math.ceil(line.quantity * 0.02) : 0
      grItems.push({
        ...org,
        goodsReceiptId: grId,
        purchaseOrderItemId: lineIds[i] as string,
        quantityReceived: (partial ? line.quantity / 2 : line.quantity - rejected).toFixed(3),
        quantityRejected: rejected.toFixed(3),
        notes: rejected ? "Damaged on delivery, returned to supplier" : null,
      })
    })

    if (opts.status !== "partially_received") {
      const invoiceId = uid()
      const invoiceDate = addDays(receivedOn, int(0, 5))
      const invoiceStatus = opts.status === "closed" ? "paid" : pick(["paid", "approved", "received"] as const)
      supplierInvoices.push({
        id: invoiceId,
        ...org,
        supplierId: supplier.id,
        purchaseOrderId: poId,
        invoiceNumber: `INV${randomDigits(7)}`,
        invoiceDate: dateOnly(invoiceDate),
        dueDate: dateOnly(addDays(invoiceDate, supplier.paymentTermDays)),
        subtotal: money(subtotal - discount),
        vatAmount: money(vat),
        total: money(total),
        status: invoiceStatus,
        approvedById: invoiceStatus === "received" ? null : approver,
        approvedAt: invoiceStatus === "received" ? null : addDays(invoiceDate, 2),
      })
      if (invoiceStatus === "paid") {
        const wht = ((subtotal - discount) * opts.whtRate) / 100
        supplierPayments.push({
          ...org,
          paymentNumber: nextNumber("PV"),
          supplierInvoiceId: invoiceId,
          amount: money(total - wht),
          whtAmount: money(wht),
          method: pick(["bank_transfer", "bank_transfer", "cheque"] as const),
          paidOn: dateOnly(addDays(invoiceDate, supplier.paymentTermDays - int(0, 5))),
          bankReference: `TRX${randomDigits(10)}`,
          paidById: pick(owners),
        })
      }
    }
  }
}

prStatuses.forEach((status, i) => {
  const projectCode = pick(activeProjectCodes)
  const supplierIndex = i % 5
  const createdAt = daysAgo(int(20, 240))
  const prId = uid()
  const isApproved = status === "approved" || status === "ordered"
  purchaseRequests.push({
    id: prId,
    ...org,
    prNumber: nextNumber("PR"),
    projectId: projectIds[projectCode] as string,
    status,
    requestedById: pick(purchasers),
    approvedById: isApproved ? pick(owners) : null,
    approvedAt: isApproved ? addDays(createdAt, int(1, 3)) : null,
    neededBy: dateOnly(addDays(createdAt, int(14, 45))),
    notes: status === "rejected" ? "Over budget, re-quote with alternative supplier" : null,
  })

  const materials = shuffle(catalog.filter((c) => c.supplier === supplierIndex)).slice(0, int(2, 3))
  const lines: PoLine[] = materials.map((m, sortOrder) => {
    const id = uid()
    const quantity = int(m.qty[0], m.qty[1])
    const budget = (budgetLineId[projectCode] as Record<string, string>)[m.budget] as string
    prItems.push({
      id,
      ...org,
      purchaseRequestId: prId,
      budgetLineId: budget,
      description: m.description,
      quantity: quantity.toFixed(3),
      unitOfMeasure: m.uom,
      estimatedUnitPrice: money(m.price),
      sortOrder,
    })
    // Negotiated price lands within ±5% of the estimate
    return {
      description: m.description,
      uom: m.uom,
      quantity,
      unitPrice: round(m.price * (0.95 + rand() * 0.1), 1),
      budgetLineId: budget,
      prItemId: id,
    }
  })

  if (status === "ordered") {
    createPurchaseOrder({
      projectCode,
      supplierIndex,
      purchaseRequestId: prId,
      status: poStatuses[i % poStatuses.length] as (typeof poStatuses)[number],
      orderDate: addDays(createdAt, int(3, 7)),
      lines,
      whtRate: 0,
    })
  }
})

// Subcontracted services go straight to a PO, with 3% withholding tax
services.forEach((service, i) => {
  const projectCode = pick(activeProjectCodes)
  createPurchaseOrder({
    projectCode,
    supplierIndex: service.supplier,
    purchaseRequestId: null,
    status: pick(["received", "closed", "approved"] as const),
    orderDate: daysAgo(int(30, 200)),
    lines: [
      {
        description: `${service.description} – ${projectCode} ${i % 2 ? "Phase 1" : "lot 1"}`,
        uom: "lump sum",
        quantity: 1,
        unitPrice: round(int(service.amount[0], service.amount[1]), 1_000),
        budgetLineId: (budgetLineId[projectCode] as Record<string, string>)[service.budget] as string,
      },
    ],
    whtRate: 3,
  })
})

// ─── Expenses (non-PO costs) ────────────────────────────────────────────────

const expenseTemplates = [
  {
    description: "Building permit fee",
    budget: "03-100",
    payee: "District Office",
    amount: [25_000, 80_000],
    vat: false,
  },
  {
    description: "Construction electricity",
    budget: "09-100",
    payee: "Metropolitan Electricity Authority",
    amount: [18_000, 65_000],
    vat: true,
  },
  {
    description: "Construction water supply",
    budget: "09-100",
    payee: "Metropolitan Waterworks Authority",
    amount: [4_000, 15_000],
    vat: true,
  },
  {
    description: "Site security guard service",
    budget: "09-100",
    payee: "Guardian Security Co., Ltd.",
    amount: [45_000, 90_000],
    vat: true,
  },
  {
    description: "Facebook & Google ads",
    budget: "08-100",
    payee: "Online advertising",
    amount: [30_000, 150_000],
    vat: true,
  },
  {
    description: "Property expo booth",
    budget: "08-100",
    payee: "Event organizer",
    amount: [120_000, 350_000],
    vat: true,
  },
  {
    description: "Land survey & soil test",
    budget: "02-100",
    payee: "GeoTest Engineering",
    amount: [60_000, 180_000],
    vat: true,
  },
] as const

const expenses: PgInsertValue<typeof s.expense>[] = Array.from({ length: 18 }, () => {
  const t = pick(expenseTemplates)
  const projectCode = pick(projectCodes)
  const amount = round(int(t.amount[0], t.amount[1]), 100)
  const day = daysAgo(int(5, 300))
  return {
    ...org,
    projectId: projectIds[projectCode] as string,
    budgetLineId: (budgetLineId[projectCode] as Record<string, string>)[t.budget],
    expenseDate: dateOnly(day),
    payee: t.payee,
    description: `${t.description} – ${day.toLocaleString("en-US", { month: "short", year: "numeric" })}`,
    amount: money(amount),
    vatAmount: money(t.vat ? amount * 0.07 : 0),
    method: pick(["bank_transfer", "cash", "cheque"] as const),
    receiptNumber: `R${randomDigits(8)}`,
    createdById: pick(purchasers),
  }
})

// ─── Defects ────────────────────────────────────────────────────────────────

const defectTemplates = [
  { title: "Water leak under kitchen sink", location: "Kitchen" },
  { title: "Cracked floor tile", location: "Living room" },
  { title: "Bathroom door does not close properly", location: "Master bathroom" },
  { title: "Paint peeling on exterior wall", location: "Front facade" },
  { title: "Power socket not working", location: "Bedroom 2" },
  { title: "Window sliding track jammed", location: "Master bedroom" },
  { title: "Water stain on ceiling", location: "Upstairs hallway" },
  { title: "Drain clogged in shower", location: "Bathroom 2" },
] as const
const defectStatuses = ["open", "in_progress", "resolved", "closed", "closed", "rejected"] as const
const subcontractors = suppliers.filter((sup) => sup.isSubcontractor)

const defects: PgInsertValue<typeof s.defectTicket>[] = completedHandovers.flatMap((h) =>
  Array.from({ length: int(1, 3) }, () => {
    const t = pick(defectTemplates)
    const status = pick(defectStatuses)
    const reportedAt = addDays(h.at, int(0, 60))
    const done = status === "resolved" || status === "closed"
    return {
      ...org,
      ticketNumber: nextNumber("DF"),
      unitId: h.unitId,
      contractId: h.contractId,
      handoverId: h.handoverId,
      reportedById: h.buyerId,
      title: t.title,
      location: t.location,
      description: `Reported by buyer: ${t.title.toLowerCase()}.`,
      priority: pick(["low", "medium", "medium", "high", "urgent"] as const),
      status,
      assignedToId: pick(managers),
      contractorId: status === "open" ? null : pick(subcontractors).id,
      reportedAt,
      resolvedAt: done ? addDays(reportedAt, int(2, 14)) : null,
    }
  }),
)

// ─── Write everything (parents before children) ────────────────────────────

await insert(s.project, projects)
await insert(s.projectPhase, phases)
await insert(s.unitType, unitTypes)
await insert(s.unit, units)
await insert(s.budgetLine, budgetLines)
await insert(s.contact, contacts)
await insert(s.lead, leads)
await insert(s.leadActivity, leadActivities)
await insert(s.reservation, reservations)
await insert(s.salesContract, contracts)
await insert(s.installment, installments)
await insert(s.customerPayment, customerPayments)
await insert(s.mortgageApplication, mortgages)
await insert(s.supplier, suppliers)
await insert(s.purchaseRequest, purchaseRequests)
await insert(s.purchaseRequestItem, prItems)
await insert(s.purchaseOrder, purchaseOrders)
await insert(s.purchaseOrderItem, poItems)
await insert(s.goodsReceipt, goodsReceipts)
await insert(s.goodsReceiptItem, grItems)
await insert(s.supplierInvoice, supplierInvoices)
await insert(s.supplierPayment, supplierPayments)
await insert(s.expense, expenses)
await insert(s.handover, handovers)
await insert(s.defectTicket, defects)

const summary = {
  projects,
  phases,
  "unit types": unitTypes,
  units,
  "budget lines": budgetLines,
  contacts,
  leads,
  "lead activities": leadActivities,
  reservations,
  "sales contracts": contracts,
  installments,
  "customer payments": customerPayments,
  "mortgage applications": mortgages,
  suppliers,
  "purchase requests": purchaseRequests,
  "purchase orders": purchaseOrders,
  "goods receipts": goodsReceipts,
  "supplier invoices": supplierInvoices,
  "supplier payments": supplierPayments,
  expenses,
  handovers,
  "defect tickets": defects,
}
console.log(`Seeded "${organization.name}":`)
for (const [name, rows] of Object.entries(summary)) console.log(`  ${name.padEnd(22)} ${rows.length}`)

process.exit(0)
