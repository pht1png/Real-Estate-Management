/**
 * Unit helpers shared by the API and the web app (live preview). Pure, no database.
 */

export const MAX_UNITS_PER_BATCH = 500

/**
 * - floors: condo rooms, floor number + 2-digit room → prefix "A-", floors 2–8, 4 rooms → A-201 … A-804
 * - sequence: houses / plots → prefix "P1-", 1–12, pad 2 → P1-01 … P1-12
 */
export type UnitNumberPattern =
  | { kind: "floors"; prefix: string; floorFrom: number; floorTo: number; roomsPerFloor: number }
  | { kind: "sequence"; prefix: string; from: number; to: number; pad: number }

export type GeneratedUnit = { unitNumber: string; floor: number | null }

export type GenerateResult = { units: GeneratedUnit[]; error: null } | { units: []; error: string }

const fail = (error: string): GenerateResult => ({ units: [], error })

export function generateUnitNumbers(pattern: UnitNumberPattern): GenerateResult {
  const prefix = pattern.prefix.trim()
  if (prefix.length > 20) return fail("Prefix is too long (20 characters max).")

  let units: GeneratedUnit[]
  if (pattern.kind === "floors") {
    const { floorFrom, floorTo, roomsPerFloor } = pattern
    if (![floorFrom, floorTo, roomsPerFloor].every(Number.isInteger))
      return fail("Floors and rooms must be whole numbers.")
    if (floorFrom < 1 || floorTo < floorFrom)
      return fail("The last floor must be the same as or above the first floor.")
    if (roomsPerFloor < 1 || roomsPerFloor > 99) return fail("Rooms per floor must be between 1 and 99.")
    units = []
    for (let floor = floorFrom; floor <= floorTo; floor++) {
      for (let room = 1; room <= roomsPerFloor; room++) {
        units.push({ unitNumber: `${prefix}${floor}${String(room).padStart(2, "0")}`, floor })
      }
    }
  } else {
    const { from, to, pad } = pattern
    if (![from, to, pad].every(Number.isInteger)) return fail("Numbers must be whole numbers.")
    if (from < 0 || to < from) return fail("The last number must be the same as or above the first.")
    if (pad < 0 || pad > 6) return fail("Digits must be between 0 and 6.")
    units = []
    for (let n = from; n <= to; n++) units.push({ unitNumber: `${prefix}${String(n).padStart(pad, "0")}`, floor: null })
  }

  if (units.length === 0) return fail("That pattern doesn't produce any units.")
  if (units.length > MAX_UNITS_PER_BATCH) {
    return fail(`That's ${units.length} units; generate at most ${MAX_UNITS_PER_BATCH} at a time.`)
  }
  return { units, error: null }
}

/** Statuses people can set by hand. Reserved / contracted / transferred come only from sales workflows. */
export const manualUnitStatuses = ["available", "on_hold", "unavailable"] as const
export type ManualUnitStatus = (typeof manualUnitStatuses)[number]

export const isManualUnitStatus = (status: string): status is ManualUnitStatus =>
  (manualUnitStatuses as readonly string[]).includes(status)

/** Manual changes are only allowed between available, on hold and unavailable. */
export function canChangeUnitStatus(from: string, to: string) {
  return from !== to && isManualUnitStatus(from) && isManualUnitStatus(to)
}
