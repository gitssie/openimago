import { Hono } from "hono"
import { authService } from "./service"
import { oauthService } from "./oauth"

export const authRoutes = new Hono()

authRoutes.post("/register", async (c) => {
  const body = await c.req.json()
  const result = await authService.register(body)

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

  return c.json({
    id: result.user.id,
    username: result.user.username,
    email: result.user.email,
    displayName: result.user.displayName,
    workspaceId: result.user.workspaceId,
    role: result.user.role,
    createdAt: result.user.createdAt.toISOString(),
    updatedAt: result.user.updatedAt.toISOString(),
  })
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
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      displayName: result.user.displayName,
      workspaceId: result.user.workspaceId,
      role: result.user.role,
      createdAt: result.user.createdAt.toISOString(),
      updatedAt: result.user.updatedAt.toISOString(),
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
