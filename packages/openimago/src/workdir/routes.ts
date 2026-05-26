import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { authMiddleware } from "../server/middleware"
import { workDirService } from "./service"
import { db } from "../db/client"
import { workspaceRefs, projects } from "../db/schema"

export const workDirRoutes = new Hono()

workDirRoutes.use("/*", authMiddleware)

// POST /api/workdir — create a working directory (standalone, no session)
workDirRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.json()
  const result = await workDirService.createSessionDir({ userId, ...body })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ directory: result.directory }, result.status as any)
})

// GET /api/workdir — list workspace_refs for this user
workDirRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.query("projectId")

  const conditions = [eq(workspaceRefs.userId, userId)]
  if (projectId) conditions.push(eq(workspaceRefs.projectId, projectId))

  const rows = await db
    .select({
      workspaceId: workspaceRefs.workspaceId,
      projectId: workspaceRefs.projectId,
      createdAt: workspaceRefs.createdAt,
    })
    .from(workspaceRefs)
    .where(eq(workspaceRefs.userId, userId))

  return c.json({ refs: rows })
})
