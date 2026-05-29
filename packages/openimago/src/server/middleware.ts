import type { Context, Next } from "hono"
import { eq } from "drizzle-orm"
import { verifyJwt } from "../auth/jwt"
import { db } from "../db/client"
import { users } from "../db/schema"
import { SessionTable } from "../db/session-schema"
import { logger } from "./logger"

declare module "hono" {
  interface ContextVariableMap {
    userId: string
    workspaceId: string | null
    role: string
    directory?: string
  }
}

/**
 * Short-lived in-memory cache for userId → workspaceId lookups.
 * Prevents a DB round-trip on every SSE reconnect while still
 * reflecting user deletion within USER_CACHE_TTL_MS.
 */
const USER_CACHE_TTL_MS = 60 * 1000 // 1 minute
const userCache = new Map<string, { workspaceId: string | null; expiresAt: number }>()

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header("authorization")
  if (!header || !header.startsWith("Bearer ")) {
    logger.warn({ path: new URL(c.req.url).pathname }, "auth: missing token")
    return c.json({ error: { code: "UNAUTHORIZED", message: "Missing token" } }, 401)
  }

  let claims: { userId: string; role: string }
  try {
    const token = header.slice(7)
    claims = await verifyJwt(token)
  } catch {
    logger.warn({ path: new URL(c.req.url).pathname }, "auth: invalid token")
    return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } }, 401)
  }

  // Look up workspace_id; may be null for users created before the migration.
  // A valid JWT can outlive a truncated/deleted user row, so reject it before
  // handlers try to insert rows that reference users(id).
  const now = Date.now()
  let workspaceId: string | null

  const cached = userCache.get(claims.userId)
  if (cached && cached.expiresAt > now) {
    workspaceId = cached.workspaceId
  } else {
    // Evict stale entry if present
    if (cached) userCache.delete(claims.userId)

    const [user] = await db
      .select({ workspaceId: users.workspaceId })
      .from(users)
      .where(eq(users.id, claims.userId))
      .limit(1)

    if (!user) {
      logger.warn({ userId: claims.userId, path: new URL(c.req.url).pathname }, "auth: user not found")
      return c.json({ error: { code: "UNAUTHORIZED", message: "User not found" } }, 401)
    }

    workspaceId = user.workspaceId ?? null
    userCache.set(claims.userId, { workspaceId, expiresAt: now + USER_CACHE_TTL_MS })
  }

  logger.debug({ userId: claims.userId, role: claims.role, path: new URL(c.req.url).pathname }, "auth: ok")
  c.set("userId", claims.userId)
  c.set("role", claims.role)
  c.set("workspaceId", workspaceId)

  await next()
}

interface RoutePattern {
  method: string
  pattern: RegExp
  needsDirectory: boolean
}

// Whitelist of OpenCode routes that openimago products need.
// All other /api/* routes are rejected with 404.
// See docs/OPENCODE-INTEGRATION.md §3.5 for the complete list.
export const ROUTE_REGISTRY: RoutePattern[] = [
  // --- needsDirectory -------------------------------------------------
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/prompt$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/prompt_async$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/command$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/abort$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/fork$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/compact$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/revert$/, needsDirectory: true },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/summarize$/, needsDirectory: true },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)\/context$/, needsDirectory: true },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)\/todo$/, needsDirectory: true },

  // --- workspace only ------------------------------------------------
  { method: "POST", pattern: /^\/api\/session$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/session$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/session\/([^/]+)\/message$/, needsDirectory: true },
  { method: "PATCH", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "DELETE", pattern: /^\/api\/session\/([^/]+)$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/wait$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/session\/([^/]+)\/unrevert$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/event$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/command$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/agent$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/question$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/question\/([^/]+)\/reply$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/question\/([^/]+)\/reject$/, needsDirectory: false },
  { method: "GET", pattern: /^\/api\/permission$/, needsDirectory: false },
  { method: "POST", pattern: /^\/api\/permission\/([^/]+)\/reply$/, needsDirectory: false },
]

async function resolveDirectory(sessionId: string, workspaceId: string): Promise<{ directory: string } | { status: number; code: string; message: string }> {
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

  if (session.workspaceId !== workspaceId) {
    return { status: 403, code: "FORBIDDEN", message: "Access denied" }
  }

  return { directory: session.directory }
}

export async function adminMiddleware(c: Context, next: Next) {
  const role = c.get("role") as string | undefined
  if (role !== "admin") {
    logger.warn({ userId: c.get("userId"), path: new URL(c.req.url).pathname }, "admin: forbidden")
    return c.json({ error: { code: "FORBIDDEN", message: "Admin access required" } }, 403)
  }
  await next()
}

export async function proxyMiddleware(c: Context, next: Next) {
  const userId = c.get("userId") as string
  const workspaceId = c.get("workspaceId") as string | null
  const pathname = new URL(c.req.url).pathname
  const method = c.req.method

  if (pathname.startsWith("/api/platform/")) {
    return next()
  }

  const route = ROUTE_REGISTRY.find(
    (r) => r.method === method && r.pattern.test(pathname),
  )

  if (!route) {
    logger.warn({ userId, method, pathname }, "proxy: route not supported")
    return c.json({ error: { code: "NOT_FOUND", message: "Route not supported" } }, 404)
  }

  if (route.needsDirectory) {
    if (!workspaceId) {
      logger.warn({ userId, method, pathname }, "proxy: workspace not configured")
      return c.json({ error: { code: "CONFIGURATION_REQUIRED", message: "Workspace not configured for this user" } }, 500)
    }
    const match = pathname.match(route.pattern)!
    const sessionId = match[1]!

    const result = await resolveDirectory(sessionId, workspaceId)

    if ("status" in result) {
      logger.warn({ userId, sessionId, code: result.code, pathname }, "proxy: directory resolve failed")
      return c.json({ error: { code: result.code, message: result.message } }, result.status as any)
    }

    logger.debug({ userId, sessionId, directory: result.directory, pathname }, "proxy: resolved directory")
    c.set("directory", result.directory)
  }

  await next()
}
