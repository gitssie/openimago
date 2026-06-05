import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { tempUploadService } from "./service"
import { randomUUID } from "node:crypto"

export const tempUploadRoutes = new Hono()

tempUploadRoutes.use("*", authMiddleware)

/** POST /api/platform/temp-uploads — homepage pre-session upload */
tempUploadRoutes.post("/", async (c) => {
  const userId = c.get("userId") as string

  const formData = await c.req.formData().catch(() => null)
  if (!formData) {
    return c.json({ error: { code: "BAD_REQUEST", message: "Expected multipart form data" } }, 400)
  }

  const files = formData.getAll("files") as File[]
  if (files.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No files provided" } }, 400)
  }

  const batchId = `batch_${randomUUID().slice(0, 8)}`
  const results = []

  for (const file of files) {
    if (!(file instanceof File)) continue
    const result = await tempUploadService.upload(userId, batchId, file)
    results.push(result)
  }

  return c.json({ batchId, attachments: results }, 201 as any)
})
