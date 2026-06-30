import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { outputsService } from "./service"

export const outputsRoutes = new Hono()
outputsRoutes.use("/*", authMiddleware)

outputsRoutes.get("/:id/outputs", async (c) => {
  const sessionId = c.req.param("id")
  const userId = c.get("userId") as string
  const workspaceId = c.get("workspaceId") as string | null
  const type = c.req.query("type")
  const order = c.req.query("order")

  const result = await outputsService.listOutputs(sessionId, userId, workspaceId, { type, order })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ outputs: result.outputs })
})

export const projectOutputsRoutes = new Hono()
projectOutputsRoutes.use("/*", authMiddleware)

projectOutputsRoutes.get("/:id/outputs", async (c) => {
  const projectId = c.req.param("id")
  const userId = c.get("userId") as string
  const type = c.req.query("type")
  const order = c.req.query("order")

  const result = await outputsService.listProjectOutputs(projectId, userId, { type, order })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ outputs: result.outputs })
})

// Delete one scanned output file from the project directory (openimago-oy1l).
projectOutputsRoutes.delete("/:id/outputs/:name", async (c) => {
  const projectId = c.req.param("id")
  const name = c.req.param("name")
  const userId = c.get("userId") as string

  const result = await outputsService.deleteProjectOutput(projectId, userId, name)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ deleted: true })
})
