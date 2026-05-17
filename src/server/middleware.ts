import type { Context, Next } from "hono"
import { eq } from "drizzle-orm"
import { verifyJwt } from "../auth/jwt"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"

declare module "hono" {
  interface ContextVariableMap {
    userId: string
    role: string
    directory?: string
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("authorization")
  if (!header || !header.startsWith("Bearer ")) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401)
  }

  try {
    const token = header.slice(7)
    const { userId, role } = await verifyJwt(token)
    c.set("userId", userId)
    c.set("role", role)
    await next()
  } catch {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401)
  }
}

interface RoutePattern {
  method: string
  pattern: RegExp
  needsDirectory: boolean
}

// Whitelist of OpenCode routes that openimago products need.
// All other /api/* routes are rejected with 404.
// See docs/OPENCODE-INTEGRATION.md §3.5 for the complete list.
const ROUTE_PATTERNS: RoutePattern[] = [
  // --- needsDirectory -------------------------------------------------
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/prompt$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/abort$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/fork$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/compact$/, needsDirectory: true },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)\/context$/, needsDirectory: true },

  // --- workspace only ------------------------------------------------
  { method: "GET", pattern: /^\/api\/session$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)\/message$/, needsDirectory: false },
  { method: "PATCH", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "DELETE", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/wait$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/event$/, needsDirectory: false },
]

async function resolveDirectory(sessionId: string, userId: string): Promise<{ directory: string } | { status: number; code: string; message: string }> {
  const rows = await db
    .select({
      workspaceId: SessionTable.workspace_id,
      directory: SessionTable.directory,
    })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionId))
    .limit(1)

  if (rows.length === 0) {
    return { status: 404, code: "NOT_FOUND", message: "Session not found" }
  }

  const session = rows[0]!

  if (session.workspaceId !== userId) {
    return { status: 403, code: "FORBIDDEN", message: "Access denied" }
  }

  return { directory: session.directory }
}

export async function proxyMiddleware(c: Context, next: Next) {
  const userId = c.get("userId") as string
  const pathname = new URL(c.req.url).pathname
  const method = c.req.method

  if (pathname.startsWith("/api/platform/")) {
    return next()
  }

  const route = ROUTE_PATTERNS.find(
    (r) => r.method === method && r.pattern.test(pathname),
  )

  if (!route) {
    return c.json({ error: { code: "NOT_FOUND", message: "Route not supported" } }, 404)
  }

  if (route.needsDirectory) {
    const match = pathname.match(route.pattern)!
    const sessionId = match[1]!

    const result = await resolveDirectory(sessionId, userId)

    if ("status" in result) {
      return c.json({ error: { code: result.code, message: result.message } }, result.status as any)
    }

    c.set("directory", result.directory)
  }

  await next()
}
