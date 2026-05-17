import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { projectService } from "./service"

export const projectRoutes = new Hono()

projectRoutes.use("/*", authMiddleware)

projectRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.json()
  const result = await projectService.create({ userId, ...body })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ project: result.project }, 201 as any)
})

projectRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const status = c.req.query("status")
  const result = await projectService.list({ userId, status })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ projects: result.projects })
})

projectRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const body = await c.req.json()
  const result = await projectService.update({ projectId, userId, ...body })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ project: result.project })
})
