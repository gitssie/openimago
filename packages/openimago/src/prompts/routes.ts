import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { promptsService } from "./service"

export const promptsRoutes = new Hono()

promptsRoutes.use("/*", authMiddleware)

promptsRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.json()
  const result = await promptsService.create(userId, body)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ template: result.template }, 201)
})

promptsRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const tag = c.req.query("tag")
  const search = c.req.query("search")
  const order = c.req.query("order") as "asc" | "desc" | undefined
  const limit = parseInt(c.req.query("limit") ?? "50", 10)
  const offset = parseInt(c.req.query("offset") ?? "0", 10)

  const result = await promptsService.list(userId, { tag, search, order, limit, offset })
  return c.json({ templates: result.templates, total: result.total })
})

promptsRoutes.get("/:id", async (c) => {
  const userId = c.get("userId") as string
  const templateId = c.req.param("id")
  const result = await promptsService.get(userId, templateId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ template: result.template })
})

promptsRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId") as string
  const templateId = c.req.param("id")
  const body = await c.req.json()
  const result = await promptsService.update(userId, templateId, body)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ template: result.template })
})

promptsRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId") as string
  const templateId = c.req.param("id")
  const result = await promptsService.delete(userId, templateId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ deleted: result.deleted })
})
