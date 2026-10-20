import { protectedProcedure, publicProcedure, router } from "../index"
import { accessRouter } from "./access"
import { salesRouter } from "./sales"

export const appRouter = router({
  access: accessRouter,
  sales: salesRouter,
  healthCheck: publicProcedure.query(() => {
    return "OK"
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    }
  }),
})
export type AppRouter = typeof appRouter
