import { TRPCError } from "@trpc/server"

export const notFound = (what: string) => new TRPCError({ code: "NOT_FOUND", message: `${what} not found` })
export const conflict = (message: string) => new TRPCError({ code: "CONFLICT", message })
export const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message })
export const forbidden = (message: string) => new TRPCError({ code: "FORBIDDEN", message })

/** Name of the unique constraint a Postgres error violated, or null. Drizzle wraps the driver error in `cause`. */
export function uniqueViolation(error: unknown): string | null {
  let current = error as { code?: string; constraint?: string; cause?: unknown } | undefined
  while (current) {
    if (current.code === "23505") return current.constraint ?? ""
    current = current.cause as typeof current
  }
  return null
}

/**
 * Runs a write that takes the next document number (RS-0001...). If two users take the same number at once,
 * the unique index rejects one, so retry once with a fresh number. Other unique violations map to `onConflict`.
 */
export async function withNumberRetry<T>(write: () => Promise<T>, onConflict: (constraint: string) => TRPCError) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await write()
    } catch (error) {
      const constraint = uniqueViolation(error)
      if (constraint === null) throw error
      if (attempt === 0 && /number|receipt/.test(constraint)) continue
      throw onConflict(constraint)
    }
  }
}
