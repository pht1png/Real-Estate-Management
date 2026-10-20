/**
 * Builds a sales contract's payment schedule. Shared by the API (to save it) and the web form (to preview it).
 *
 * Price breakdown: net price = reservation fee (already paid) + down payment + transfer payment.
 * The down payment is split into an upfront contract payment plus N equal monthly installments.
 */

export type ScheduleInput = {
  netPrice: number
  reservationFee: number
  downPaymentAmount: number
  contractPaymentAmount: number
  downPaymentMonths: number
  /** YYYY-MM-DD */
  contractDate: string
  /** YYYY-MM-DD */
  transferDate: string
}

export type ScheduleItem = {
  sequence: number
  type: "contract_payment" | "down_payment" | "transfer_payment"
  /** YYYY-MM-DD */
  dueDate: string
  /** Decimal string with 2 places, ready for a numeric column */
  amount: string
}

export type ScheduleResult = { items: ScheduleItem[]; error: null } | { items: []; error: string }

// Work in satang (1/100 baht) so amounts add up exactly
const toSatang = (baht: number) => Math.round(baht * 100)
const toBaht = (satang: number) => (satang / 100).toFixed(2)

/** Adds months to a YYYY-MM-DD date, clamping to the end of the month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number) {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

export function buildInstallmentSchedule(input: ScheduleInput): ScheduleResult {
  const net = toSatang(input.netPrice)
  const fee = toSatang(input.reservationFee)
  const down = toSatang(input.downPaymentAmount)
  const upfront = toSatang(input.contractPaymentAmount)
  const months = input.downPaymentMonths
  const transfer = net - fee - down
  const monthlyTotal = down - upfront

  if (net <= 0) return { items: [], error: "Net price must be more than zero." }
  if (upfront > down) return { items: [], error: "Contract payment can't be more than the down payment." }
  if (monthlyTotal > 0 && months < 1) {
    return {
      items: [],
      error: "Add at least one monthly installment, or make the contract payment the full down payment.",
    }
  }
  if (transfer <= 0) {
    return { items: [], error: "Reservation fee plus down payment must be less than the net price." }
  }
  if (input.transferDate <= input.contractDate) {
    return { items: [], error: "Transfer date must be after the contract date." }
  }

  const items: Omit<ScheduleItem, "sequence">[] = []
  if (upfront > 0) items.push({ type: "contract_payment", dueDate: input.contractDate, amount: toBaht(upfront) })

  if (monthlyTotal > 0) {
    const perMonth = Math.floor(monthlyTotal / months)
    for (let m = 1; m <= months; m++) {
      // The last installment absorbs the rounding remainder
      const amount = m === months ? monthlyTotal - perMonth * (months - 1) : perMonth
      items.push({ type: "down_payment", dueDate: addMonths(input.contractDate, m), amount: toBaht(amount) })
    }
  }

  items.push({ type: "transfer_payment", dueDate: input.transferDate, amount: toBaht(transfer) })

  const lastDownPayment = items.at(-2)
  if (lastDownPayment && lastDownPayment.dueDate > input.transferDate) {
    return {
      items: [],
      error: "The last down payment falls after the transfer date. Use fewer months or a later transfer.",
    }
  }

  return { items: items.map((item, i) => ({ ...item, sequence: i + 1 })), error: null }
}
