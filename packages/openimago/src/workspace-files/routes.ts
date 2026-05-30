import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { workspaceFilesService, type RegisterWorkspaceFileInput } from "./service"

/** POST /api/platform/workspace-files — register a tool-generated workspace file */
export const workspaceFilesRoutes = new Hono()
workspaceFilesRoutes.use("/*", authMiddleware)

workspaceFilesRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string
  const workspaceId = c.get("workspaceId") as string | null

  const body = await c.req.json<RegisterWorkspaceFileInput>()

  const result = await workspaceFilesService.registerFile(body, userId, workspaceId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json(
    { workspaceFileId: result.workspaceFileId, result: result.result },
    result.status as any,
  )
})

/** GET /api/platform/sessions/:id/workspace-files — list session-scoped tool-generated workspace files */
export const sessionWorkspaceFilesRoutes = new Hono()
sessionWorkspaceFilesRoutes.use("/*", authMiddleware)

sessionWorkspaceFilesRoutes.get("/:id/workspace-files", async (c) => {
  const sessionId = c.req.param("id")
  const userId = c.get("userId") as string
  const workspaceId = c.get("workspaceId") as string | null
  const source = c.req.query("source")

  const result = await workspaceFilesService.listFiles(sessionId, userId, workspaceId, {
    source,
  })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ workspaceFiles: result.workspaceFiles })
})
