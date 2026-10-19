import type { Permissions } from "@real-estate-management/auth/permissions"
import { initTRPC, TRPCError } from "@trpc/server"

import type { Context } from "./context"

export const t = initTRPC.context<Context>().create()

export const router = t.router

export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required baby",
      cause: "No session",
    })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  })
})

export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  const orgId = ctx.session.session.activeOrganizationId
  if (!orgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No active organization",
      cause: "No active organization",
    })
  }
  return next({
    ctx: {
      ...ctx,
      orgId,
    },
  })
})

export const permissionProcedure = (permissions: Permissions) =>
  orgProcedure.use(async ({ ctx, next }) => {
    const { success } = await ctx.auth.api.hasPermission({
      headers: ctx.headers,
      body: { permissions },
    })
    if (!success) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have permission to do this",
      })
    }
    return next()
  })
