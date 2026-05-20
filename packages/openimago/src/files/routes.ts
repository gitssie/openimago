import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { fileService } from "./service"

export const filesRoutes = new Hono()

filesRoutes.use("/*", authMiddleware)

filesRoutes.post("/upload", async (c) => {
  const userId = c.get("userId") as string
  const body = await c.req.parseBody()

  const file = body.file as File | undefined
  if (!file || typeof file === "string") {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "No file provided" } }, 400)
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : undefined
  const directory = typeof body.directory === "string" ? body.directory : undefined

  const result = await fileService.upload({ userId, file, projectId, directory })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ file: result.file }, 201)
})
