import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { skillConfigService } from "./service"

// Per-project user skill config routes (openimago-wjcp).
// Mounted under /api/platform/projects, so paths are /:id/skills[...].
export const projectSkillsRoutes = new Hono()

projectSkillsRoutes.use("/:id/skills", authMiddleware)
projectSkillsRoutes.use("/:id/skills/*", authMiddleware)

// GET /api/platform/projects/:id/skills
projectSkillsRoutes.get("/:id/skills", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const result = await skillConfigService.list({ userId, projectId })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skills: result.skills })
})

// POST /api/platform/projects/:id/skills  body: { name, description, content }
projectSkillsRoutes.post("/:id/skills", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")

  let body: { name?: unknown; description?: unknown; content?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // Empty/invalid body — validation below rejects with 400.
  }

  const name = typeof body.name === "string" ? body.name : ""
  const description = typeof body.description === "string" ? body.description : ""
  const content = typeof body.content === "string" ? body.content : ""

  const result = await skillConfigService.create({ userId, projectId, name, description, content })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill }, 201)
})

// GET /api/platform/projects/:id/skills/:name
projectSkillsRoutes.get("/:id/skills/:name", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const name = c.req.param("name")
  const result = await skillConfigService.get({ userId, projectId, name })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill })
})

// PUT /api/platform/projects/:id/skills/:name  body: { description?, content? }
projectSkillsRoutes.put("/:id/skills/:name", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const name = c.req.param("name")

  let body: { description?: unknown; content?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // Empty body — no-op update (description/content stay unchanged).
  }

  const update: { description?: string; content?: string } = {}
  if (typeof body.description === "string") update.description = body.description
  if (typeof body.content === "string") update.content = body.content

  const result = await skillConfigService.update({ userId, projectId, name, ...update })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill })
})

// DELETE /api/platform/projects/:id/skills/:name
projectSkillsRoutes.delete("/:id/skills/:name", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const name = c.req.param("name")
  const result = await skillConfigService.remove({ userId, projectId, name })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ ok: true })
})
