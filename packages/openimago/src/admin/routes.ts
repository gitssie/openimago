import { Hono } from "hono"
import { adminService } from "./service"

export const adminRoutes = new Hono()

adminRoutes.get("/users", async (c) => {
  const search = c.req.query("search")
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  // userId and role are set by authMiddleware
  const result = await adminService.listUsers({ search, limit, offset })

  return c.json({
    users: result.users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      workspaceId: u.workspaceId,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    })),
    total: result.total,
  })
})

adminRoutes.patch("/users/:id/role", async (c) => {
  const adminId = c.get("userId") as string
  const targetUserId = c.req.param("id")
  const body = await c.req.json()
  const { role } = body

  const result = await adminService.updateRole(adminId, targetUserId, role)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
      workspaceId: result.user.workspaceId,
      createdAt: result.user.createdAt.toISOString(),
      updatedAt: result.user.updatedAt.toISOString(),
    },
  })
})
