import { describe, expect, test } from "bun:test"

import { canChangeUnitStatus, generateUnitNumbers, MAX_UNITS_PER_BATCH } from "../src/lib/units"

describe("generateUnitNumbers", () => {
  test("floors × rooms", () => {
    const result = generateUnitNumbers({ kind: "floors", prefix: "A-", floorFrom: 2, floorTo: 3, roomsPerFloor: 2 })
    expect(result.units.map((u) => u.unitNumber)).toEqual(["A-201", "A-202", "A-301", "A-302"])
    expect(result.units.map((u) => u.floor)).toEqual([2, 2, 3, 3])
  })

  test("rooms are always two digits", () => {
    const result = generateUnitNumbers({ kind: "floors", prefix: "B", floorFrom: 12, floorTo: 12, roomsPerFloor: 10 })
    expect(result.units.at(0)?.unitNumber).toBe("B1201")
    expect(result.units.at(-1)?.unitNumber).toBe("B1210")
  })

  test("sequence with padding", () => {
    const result = generateUnitNumbers({ kind: "sequence", prefix: "P1-", from: 1, to: 12, pad: 2 })
    expect(result.units.map((u) => u.unitNumber)).toEqual(
      Array.from({ length: 12 }, (_, i) => `P1-${String(i + 1).padStart(2, "0")}`),
    )
    expect(result.units.every((u) => u.floor === null)).toBe(true)
  })

  test("sequence without padding", () => {
    expect(
      generateUnitNumbers({ kind: "sequence", prefix: "T", from: 9, to: 10, pad: 0 }).units.map((u) => u.unitNumber),
    ).toEqual(["T9", "T10"])
  })

  test.each([
    [{ kind: "floors", prefix: "A-", floorFrom: 5, floorTo: 4, roomsPerFloor: 2 }, "last floor"],
    [{ kind: "floors", prefix: "A-", floorFrom: 1, floorTo: 2, roomsPerFloor: 0 }, "Rooms per floor"],
    [{ kind: "floors", prefix: "A-", floorFrom: 1.5, floorTo: 2, roomsPerFloor: 2 }, "whole numbers"],
    [{ kind: "sequence", prefix: "P-", from: 10, to: 1, pad: 2 }, "last number"],
    [{ kind: "sequence", prefix: "P-", from: 1, to: 2, pad: 9 }, "Digits"],
    [{ kind: "sequence", prefix: "P-", from: 1, to: MAX_UNITS_PER_BATCH + 1, pad: 3 }, "at most"],
  ] as const)("rejects invalid pattern %#", (pattern, message) => {
    const result = generateUnitNumbers(pattern)
    expect(result.units).toEqual([])
    expect(result.error).toContain(message)
  })

  test("exactly the batch limit is allowed", () => {
    const result = generateUnitNumbers({ kind: "sequence", prefix: "", from: 1, to: MAX_UNITS_PER_BATCH, pad: 0 })
    expect(result.units).toHaveLength(MAX_UNITS_PER_BATCH)
  })
})

describe("canChangeUnitStatus", () => {
  test.each([
    ["available", "on_hold", true],
    ["on_hold", "available", true],
    ["available", "unavailable", true],
    ["unavailable", "on_hold", true],
    ["available", "available", false],
    ["available", "reserved", false],
    ["reserved", "available", false],
    ["contracted", "on_hold", false],
    ["transferred", "unavailable", false],
  ])("%s → %s: %p", (from, to, allowed) => {
    expect(canChangeUnitStatus(from, to)).toBe(allowed)
  })
})
