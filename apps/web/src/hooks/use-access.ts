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
