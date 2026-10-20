import { describe, expect, test } from "bun:test"

import { addMonths, buildInstallmentSchedule } from "../src/lib/installments"

const base = {
  netPrice: 3_000_000,
  reservationFee: 20_000,
  downPaymentAmount: 300_000,
  contractPaymentAmount: 50_000,
  downPaymentMonths: 3,
  contractDate: "2026-01-31",
  transferDate: "2026-12-01",
}

const sum = (amounts: string[]) => amounts.reduce((total, a) => total + Math.round(Number(a) * 100), 0) / 100

describe("buildInstallmentSchedule", () => {
  test("contract payment, monthly down payments, transfer; adds up to net price minus fee", () => {
    const { items, error } = buildInstallmentSchedule(base)
    expect(error).toBeNull()
    expect(items.map((i) => i.type)).toEqual([
      "contract_payment",
      "down_payment",
      "down_payment",
      "down_payment",
      "transfer_payment",
    ])
    expect(items.map((i) => i.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(sum(items.map((i) => i.amount))).toBe(base.netPrice - base.reservationFee)
    expect(items.at(-1)?.amount).toBe("2680000.00")
  })

  test("the last monthly installment absorbs rounding", () => {
    const { items } = buildInstallmentSchedule({ ...base, downPaymentAmount: 150_000, contractPaymentAmount: 50_000 })
    const monthly = items.filter((i) => i.type === "down_payment").map((i) => i.amount)
    expect(monthly).toEqual(["33333.33", "33333.33", "33333.34"])
  })

  test("month-end contract dates clamp to the end of shorter months", () => {
    const { items } = buildInstallmentSchedule(base)
    expect(items.filter((i) => i.type === "down_payment").map((i) => i.dueDate)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ])
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29")
  })

  test("whole down payment at signing needs no monthly installments", () => {
    const { items, error } = buildInstallmentSchedule({ ...base, contractPaymentAmount: 300_000, downPaymentMonths: 0 })
    expect(error).toBeNull()
    expect(items.map((i) => i.type)).toEqual(["contract_payment", "transfer_payment"])
  })

  test.each([
    [{ contractPaymentAmount: 400_000 }, "can't be more than the down payment"],
    [{ downPaymentMonths: 0 }, "at least one monthly installment"],
    [{ downPaymentAmount: 2_990_000 }, "must be less than the net price"],
    [{ transferDate: "2026-01-01" }, "after the contract date"],
    [{ downPaymentMonths: 12, transferDate: "2026-06-01" }, "falls after the transfer date"],
  ])("rejects %o", (overrides, message) => {
    const result = buildInstallmentSchedule({ ...base, ...overrides })
    expect(result.items).toEqual([])
    expect(result.error).toContain(message)
  })
})
