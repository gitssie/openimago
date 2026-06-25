import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { assetsService } from "./service"

export const assetsRoutes = new Hono()

assetsRoutes.use("/*", authMiddleware)

assetsRoutes.post("/upload", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.parseBody()

  const file = body.file as File | undefined
  if (!file || typeof file === "string") {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No file provided" } }, 400)
  }

  const result = await assetsService.upload(userId, file)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ asset: result.asset }, 201)
})

assetsRoutes.get("/", async (c) => {
  const userId = c.get("userId") as string
  const type = c.req.query("type")
  const cursor = c.req.query("cursor")
  const order = c.req.query("order")
  const limit = parseInt(c.req.query("limit") ?? "50", 10)

  const result = await assetsService.list(userId, { type, cursor, order, limit })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ items: result.items, cursor: result.cursor })
})

assetsRoutes.get("/:id/download", async (c) => {
  const userId = c.get("userId") as string
  const assetId = c.req.param("id")
  const result = await assetsService.download(userId, assetId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return new Response(new Blob([result.bytes], { type: result.mimeType }), {
    status: 200,
    headers: { "content-type": result.mimeType },
  })
})

assetsRoutes.get("/:id", async (c) => {
  const userId = c.get("userId") as string
  const assetId = c.req.param("id")
  const result = await assetsService.get(userId, assetId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ asset: result.asset })
})

assetsRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId") as string
  const assetId = c.req.param("id")
  const result = await assetsService.delete(userId, assetId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ asset: result.asset })
})
