import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { workDirService } from "./service"
import { createProxyConfig, forward } from "../proxy/service"

export const workDirRoutes = new Hono()

workDirRoutes.use("/*", authMiddleware)

workDirRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.json()
  const result = await workDirService.createSessionDir({ userId, ...body })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  const config = createProxyConfig()
  const sessionRes = await forward(config, {
    method: "POST",
    path: "/session",
    directory: result.workDir.fullPath,
    userId,
    body,
  })

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}))
    return c.json(err, sessionRes.status as any)
  }

  const session = await sessionRes.json()
  return c.json({ session, workDir: result.workDir }, 201 as any)
})

workDirRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.query("projectId")
  const type = c.req.query("type")
  const result = await workDirService.list({ userId, projectId, type })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ workDirs: result.workDirs })
})
