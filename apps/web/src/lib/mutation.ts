import { toast } from "sonner"

import { queryClient } from "@/utils/trpc"

/**
 * Shared success/error callbacks for mutations. Workflows touch several lists at once (and sometimes
 * several tabs), so refetch every active query rather than guessing which ones changed.
 *
 *   useMutation(trpc.sales.leads.create.mutationOptions(mutationCallbacks("Lead created", close)))
 */
export function mutationCallbacks(successMessage: string, after?: () => void) {
  return {
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success(successMessage)
      after?.()
    },
    onError: (error: { message: string }) => {
      toast.error(error.message)
    },
  }
}

export const today = () => new Date().toLocaleDateString("en-CA")

export const addDaysIso = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA")

/** "" → null, "123" → 123 for optional number inputs. */
export const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value))
