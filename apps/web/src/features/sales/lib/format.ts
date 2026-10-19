const thb = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 })
const compactThb = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

export function formatMoney(value: string | number | null | undefined) {
  return value === null || value === undefined ? "—" : thb.format(Number(value))
}

/** ฿36.6M, for stat cards. */
export function formatMoneyCompact(value: string | number | null | undefined) {
  return value === null || value === undefined ? "—" : `฿${compactThb.format(Number(value))}`
}

// tRPC has no transformer, so dates arrive as ISO strings even though they're typed as Date
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export function daysUntil(value: string | Date) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
}

/** "bank_transfer" → "Bank transfer" */
export function labelize(value: string) {
  const text = value.replaceAll("_", " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
