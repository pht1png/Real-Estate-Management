import { ilike, or, type SQL } from "drizzle-orm"
import { z } from "zod"

export const PAGE_SIZE = 20

export const listInput = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
})

export const idInput = z.object({ id: z.string().min(1) })
export const reasonInput = idInput.extend({ reason: z.string().trim().min(1, "Give a reason").max(500) })

export const moneyInput = z.number().min(0).max(10_000_000_000)
export const dateInput = z.iso.date()
export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

/** `%term%` for ilike, or undefined when there's nothing to search for. */
export const searchTerm = (search?: string) => (search ? `%${search}%` : undefined)

export const searchAny = (term: string | undefined, ...columns: (SQL | Parameters<typeof ilike>[0])[]) =>
  term ? or(...columns.map((column) => ilike(column, term))) : undefined

export const paginate = (page: number) => ({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })

export const toMoney = (n: number) => n.toFixed(2)

/** A YYYY-MM-DD date as a timestamp at noon Bangkok time, so it shows as the same day everywhere. */
export const dateToTimestamp = (date: string) => new Date(`${date}T12:00:00+07:00`)
