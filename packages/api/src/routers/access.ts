import { areasFor } from "@real-estate-management/auth/access"

import { accessProcedure, router } from "../index"

export const accessRouter = router({
  /** What the current member can reach: their role, department teams and the app areas those unlock. */
  me: accessProcedure.query(({ ctx }) => ({ ...ctx.access, areas: areasFor(ctx.access) })),
})
