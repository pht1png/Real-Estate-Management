import { protectedProcedure, publicProcedure, router } from "../index"
import { accessRouter } from "./access"
import { projectsRouter } from "./projects"
import { salesRouter } from "./sales"

export const appRouter = router({
  access: accessRouter,
  projects: projectsRouter,
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
