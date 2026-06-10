import { Hono } from "hono"
import { authService } from "./service"
import { oauthService } from "./oauth"
import { users } from "../db/schema"

export const authRoutes = new Hono()

type AuthUser = typeof users.$inferSelect

function serializeUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    displayName: user.displayName,
    workspaceId: user.workspaceId,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header || !header.startsWith("Bearer ")) return undefined
  return header.slice(7)
}

// POST /auth/email-verification/send — request a verification code
authRoutes.post("/email-verification/send", async (c) => {
  const body = await c.req.json()
  const result = await authService.sendVerificationCode(body.email, bearerToken(c.req.header("authorization")))

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ success: result.success })
})

// POST /auth/email-verification/verify — verify the logged-in user's existing email
authRoutes.post("/email-verification/verify", async (c) => {
  const token = bearerToken(c.req.header("authorization"))
  if (!token) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401)
  }

  const body = await c.req.json()
  const result = await authService.verifyExistingEmail(token, body.code)

  if ("error" in result) {
    if (result.status === 400) return c.json({ error: result.error }, 400)
    return c.json({ error: result.error }, 401)
  }

  return c.json({ user: serializeUser(result.user) })
})

authRoutes.post("/register", async (c) => {
  const body = await c.req.json()
  const result = await authService.register(body)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json(
    {
      user: {
        ...serializeUser(result.user),
      },
      token: result.token,
      requiresEmailVerification: result.requiresEmailVerification,
    },
    201 as any,
  )
})

authRoutes.post("/login", async (c) => {
  const body = await c.req.json()
  const result = await authService.login(body)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json(
    {
      user: {
        ...serializeUser(result.user),
      },
      token: result.token,
      requiresEmailVerification: result.requiresEmailVerification,
    },
  )
})

authRoutes.get("/me", async (c) => {
  const header = c.req.header("authorization")
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401)
  }

  const token = header.slice(7)
  const result = await authService.me(token)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json(serializeUser(result.user))
})

// PATCH /auth/me — update profile
authRoutes.patch("/me", async (c) => {
  const header = c.req.header("authorization")
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401)
  }

  const token = header.slice(7)
  const body = await c.req.json()
  const result = await authService.updateProfile(token, body)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({
    user: {
      ...serializeUser(result.user),
    },
  })
})

// OAuth routes
authRoutes.get("/oauth/:provider", (c) => {
  const provider = c.req.param("provider")
  const redirectUri = c.req.query("redirectUri")
  const result = oauthService.getRedirectUrl(provider, redirectUri ?? undefined)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ redirectUrl: result.redirectUrl })
})

authRoutes.get("/oauth/:provider/callback", async (c) => {
  const provider = c.req.param("provider")
  const code = c.req.query("code") ?? ""
  const state = c.req.query("state") ?? ""
  const result = await oauthService.handleCallback(provider, code, state)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json(
    {
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        displayName: result.user.displayName,
        workspaceId: result.user.workspaceId,
        role: result.user.role,
        createdAt: result.user.createdAt.toISOString(),
        updatedAt: result.user.updatedAt.toISOString(),
      },
      token: result.token,
    },
    result.status as any,
  )
})
