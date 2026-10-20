import { type Area, canUseArea } from "@real-estate-management/auth/access"
import type { Permissions } from "@real-estate-management/auth/permissions"
import { initTRPC, TRPCError } from "@trpc/server"

import type { Context } from "./context"
import { loadAccess } from "./lib/access"

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

/** Adds the member's role and department teams to the context. */
export const accessProcedure = orgProcedure.use(async ({ ctx, next }) => {
  const access = await loadAccess(ctx.db, ctx.orgId, ctx.session.user.id)
  if (!access.role) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You're not a member of this organization" })
  }
  return next({ ctx: { ...ctx, access } })
})

/**
 * Requires access to at least one of these areas of the app, which comes from department team membership
 * (owner and admin can use every area). E.g. areaProcedure("sales") for the Sales & Marketing team.
 */
export const areaProcedure = (...areas: Area[]) =>
  accessProcedure.use(({ ctx, next }) => {
    if (!areas.some((area) => canUseArea(ctx.access, area))) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your department doesn't have access to this" })
    }
    return next()
  })
