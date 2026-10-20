import { roleCan } from "@real-estate-management/auth/permissions"
import { useQuery } from "@tanstack/react-query"

import { trpc } from "@/utils/trpc"

/** The current member's role, department teams and unlocked areas (cached; same data as the sidebar). */
export function useAccess() {
  return useQuery(trpc.access.me.queryOptions(undefined, { staleTime: 60_000 })).data
}

/** What the current role may do with projects. Only hides UI; the API enforces the same rules. */
export function useProjectPermissions() {
  const role = useAccess()?.role
  return {
    canCreate: roleCan(role, { project: ["create"] }),
    canUpdate: roleCan(role, { project: ["update"] }),
    canDelete: roleCan(role, { project: ["delete"] }),
  }
}

/**
 * Sales & Marketing team: create and edit; cancel/delete also needs manager/admin/owner.
 * Accounting & Finance team: record payments; voiding also needs manager/admin/owner.
 * Mirrors the API's checks so buttons only show when the action will work.
 */
export function useSalesPermissions() {
  const access = useAccess()
  const sales = access?.areas.includes("sales") ?? false
  const accounting = access?.areas.includes("accounting") ?? false
  return {
    canCreate: sales,
    canUpdate: sales,
    canDelete: sales && roleCan(access?.role, { sales: ["cancel"] }),
    canRecordPayment: accounting,
    canVoid: accounting && roleCan(access?.role, { payment: ["void"] }),
  }
}
