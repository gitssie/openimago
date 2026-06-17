import { Hono, type Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { authMiddleware } from "../server/middleware"
import { hasServiceApiKey, validateServiceApiKey } from "../server/service-auth"
import { workspaceFilesService, type RegisterWorkspaceFileInput } from "./service"

type RegisterResult = Awaited<
  ReturnType<typeof workspaceFilesService.registerFile>
>

/** Map a registerFile result to a JSON response (shared by both auth channels). */
function registerResponse(c: Context, result: RegisterResult): Response {
  const status = result.status as ContentfulStatusCode
  if ("error" in result) {
    return c.json({ error: result.error }, status)
  }
  return c.json(
    { workspaceFileId: result.workspaceFileId, result: result.result },
    status,
  )
}

/** POST /api/platform/workspace-files — register a tool-generated workspace file */
export const workspaceFilesRoutes = new Hono()

/**
 * Dual-channel auth for registration:
 *   - Service channel: trusted backend callers (e.g. the OpenCode plugin) send
 *     `x-api-key`. Identity is resolved from body.sessionId by registerFile;
 *     ownership check is skipped (workspaceId=null).
 *   - User channel: browser clients send `Authorization: Bearer <jwt>`; the
 *     existing JWT auth + workspace ownership check applies unchanged.
 */
workspaceFilesRoutes.use("/*", async (c, next) => {
  if (hasServiceApiKey(c)) {
    const authError = validateServiceApiKey(c)
    if (authError) return authError
    return next()
  }
  return authMiddleware(c, next)
})

workspaceFilesRoutes.post("/", async (c) => {
  const body = await c.req.json<RegisterWorkspaceFileInput>()

  // Service channel: no JWT identity. registerFile resolves the workspace from
  // body.sessionId and we pass workspaceId=null to skip the ownership check.
  if (hasServiceApiKey(c)) {
    const result = await workspaceFilesService.registerFile(body, "", null)
    return registerResponse(c, result)
  }

  const userId = c.get("userId") as string
  const workspaceId = c.get("workspaceId") as string | null

  const result = await workspaceFilesService.registerFile(body, userId, workspaceId)
  return registerResponse(c, result)
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
