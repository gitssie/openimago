import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { skillConfigService } from "./service"

// Per-user skill config routes (openimago-680i, supersedes per-project openimago-wjcp).
// Mounted under /api/platform/skills. A single per-user skill library; the DB row
// is the source of truth. Skills materialize into a project on session-create.
export const userSkillsRoutes = new Hono()

userSkillsRoutes.use("/", authMiddleware)
userSkillsRoutes.use("/*", authMiddleware)

// GET /api/platform/skills
userSkillsRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const result = await skillConfigService.list({ userId })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skills: result.skills })
})

// POST /api/platform/skills  body: { name, description, content }
userSkillsRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string

  let body: { name?: unknown; description?: unknown; content?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // Empty/invalid body — validation below rejects with 400.
  }

  const name = typeof body.name === "string" ? body.name : ""
  const description = typeof body.description === "string" ? body.description : ""
  const content = typeof body.content === "string" ? body.content : ""

  const result = await skillConfigService.create({ userId, name, description, content })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill }, 201)
})

// GET /api/platform/skills/:name
userSkillsRoutes.get("/:name", async (c) => {
  const userId = c.get("userId") as string
  const name = c.req.param("name")
  const result = await skillConfigService.get({ userId, name })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill })
})

// PUT /api/platform/skills/:name  body: { description?, content? }
userSkillsRoutes.put("/:name", async (c) => {
  const userId = c.get("userId") as string
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

  const result = await skillConfigService.update({ userId, name, ...update })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ skill: result.skill })
})

// DELETE /api/platform/skills/:name
userSkillsRoutes.delete("/:name", async (c) => {
  const userId = c.get("userId") as string
  const name = c.req.param("name")
  const result = await skillConfigService.remove({ userId, name })
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ ok: true })
})
