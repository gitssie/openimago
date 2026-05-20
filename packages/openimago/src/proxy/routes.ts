import { Hono } from "hono"
import { and, or, eq, like, isNull, gte, gt, lt, asc, desc } from "drizzle-orm"
import { authMiddleware, proxyMiddleware } from "../server/middleware"
import { proxyRequest, createProxyConfig } from "./service"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"
import { MessageTable } from "../db/message-schema"

export function createProxyRoutes(configOverrides?: { opencodeUrl?: string }) {
  const config = createProxyConfig(configOverrides)
  const routes = new Hono()

  routes.use("/*", authMiddleware)
  routes.use("/api/*", proxyMiddleware)

  // ── F class: Session list (direct PG) ─────────────────────────
  routes.get("/api/session", async (c) => {
    const userId = c.get("userId") as string
    const workspaceId = c.get("workspaceId") as string | null
    const query = c.req.query()

    let cursor: any
    if (query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString())
      } catch {
        return c.json({ error: { code: "INVALID_CURSOR", message: "Bad cursor" } }, 400)
      }
    }

    const filters = cursor ?? query
    const requestedWorkspace = filters.workspaceID ?? filters.workspace

    if (requestedWorkspace && requestedWorkspace !== workspaceId) {
      return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403)
    }

    if (!workspaceId) {
      return c.json({ items: [], cursor: { previous: undefined, next: undefined } })
    }

    const conditions: any[] = [eq(SessionTable.workspace_id, workspaceId)]

    if (filters.directory) conditions.push(eq(SessionTable.directory, filters.directory))
    if (filters.path) conditions.push(or(eq(SessionTable.path, filters.path), like(SessionTable.path, `${filters.path}/%`))!)
    if (filters.roots) conditions.push(isNull(SessionTable.parent_id))
    if (filters.start) conditions.push(gte(SessionTable.time_created, Number(filters.start)))
    if (filters.search) conditions.push(like(SessionTable.title, `%${filters.search}%`))

    const direction = cursor?.direction ?? "next"
    let order: "asc" | "desc" = query.order === "asc" ? "asc" : "desc"
    if (direction === "previous" && order === "asc") order = "desc"
    if (direction === "previous" && order === "desc") order = "asc"

    if (cursor) {
      conditions.push(
        order === "asc"
          ? or(gt(SessionTable.time_created, cursor.time), and(eq(SessionTable.time_created, cursor.time), gt(SessionTable.id, cursor.id)))!
          : or(lt(SessionTable.time_created, cursor.time), and(eq(SessionTable.time_created, cursor.time), lt(SessionTable.id, cursor.id)))!,
      )
    }

    const limit = Math.min(Number(query.limit) || 50, 200)
    const rows = await db
      .select()
      .from(SessionTable)
      .where(and(...conditions))
      .orderBy(
        order === "asc" ? asc(SessionTable.time_created) : desc(SessionTable.time_created),
        order === "asc" ? asc(SessionTable.id) : desc(SessionTable.id),
      )
      .limit(limit)

    const items = direction === "previous" ? rows.toReversed() : rows
    const first = items[0]
    const last = items.at(-1)

    const cursorFor = (session: typeof items[number] | undefined, dir: "previous" | "next") => {
      if (!session) return undefined
      const obj: any = { id: session.id, time: session.time_created, order, direction: dir }
      if (filters.directory) obj.directory = filters.directory
      if (filters.path) obj.path = filters.path
      if (filters.roots) obj.roots = true
      if (filters.start) obj.start = Number(filters.start)
      if (filters.search) obj.search = filters.search
      return Buffer.from(JSON.stringify(obj)).toString("base64url")
    }

    return c.json({
      items,
      cursor: {
        previous: cursorFor(first, "previous"),
        next: cursorFor(last, "next"),
      },
    })
  })

  // ── F class: Session detail (direct PG) ────────────────────────
  routes.get("/api/session/:id", async (c) => {
    const workspaceId = c.get("workspaceId") as string | null
    const sessionId = c.req.param("id")

    if (!workspaceId) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)

    const [session] = await db
      .select()
      .from(SessionTable)
      .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.workspace_id, workspaceId)))
      .limit(1)

    if (!session) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)
    return c.json(session)
  })

  // ── F class: Session messages (direct PG) ──────────────────────
  routes.get("/api/session/:id/message", async (c) => {
    const workspaceId = c.get("workspaceId") as string | null
    const sessionId = c.req.param("id")
    const query = c.req.query()

    if (!workspaceId) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)

    const [session] = await db
      .select({ id: SessionTable.id })
      .from(SessionTable)
      .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.workspace_id, workspaceId)))
      .limit(1)
    if (!session) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)

    let cursor: any
    if (query.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(query.cursor, "base64url").toString())
      } catch {
        return c.json({ error: { code: "INVALID_CURSOR", message: "Bad cursor" } }, 400)
      }
    }

    const conditions: any[] = [eq(MessageTable.session_id, sessionId)]
    let order: "asc" | "desc" = query.order === "asc" ? "asc" : "desc"
    const direction = cursor?.direction ?? "next"

    if (cursor) {
      let effOrder = order
      if (direction === "previous" && effOrder === "asc") effOrder = "desc"
      if (direction === "previous" && effOrder === "desc") effOrder = "asc"
      conditions.push(
        effOrder === "asc"
          ? or(gt(MessageTable.time_created, cursor.time), and(eq(MessageTable.time_created, cursor.time), gt(MessageTable.id, cursor.id)))!
          : or(lt(MessageTable.time_created, cursor.time), and(eq(MessageTable.time_created, cursor.time), lt(MessageTable.id, cursor.id)))!,
      )
    }

    const limit = query.limit ? Math.min(Number(query.limit), 200) : undefined
    const rows = limit
      ? await db
          .select()
          .from(MessageTable)
          .where(and(...conditions))
          .orderBy(
            order === "asc" ? asc(MessageTable.time_created) : desc(MessageTable.time_created),
            order === "asc" ? asc(MessageTable.id) : desc(MessageTable.id),
          )
          .limit(limit)
      : await db
          .select()
          .from(MessageTable)
          .where(and(...conditions))
          .orderBy(
            order === "asc" ? asc(MessageTable.time_created) : desc(MessageTable.time_created),
            order === "asc" ? asc(MessageTable.id) : desc(MessageTable.id),
          )

    const items = direction === "previous" ? rows.toReversed() : rows
    const first = items[0]
    const last = items.at(-1)

    const cursorFor = (msg: typeof items[number] | undefined, dir: "previous" | "next") => {
      if (!msg) return undefined
      return Buffer.from(JSON.stringify({ id: msg.id, time: msg.time_created, order, direction: dir })).toString("base64url")
    }

    return c.json({
      items,
      cursor: {
        previous: cursorFor(first, "previous"),
        next: cursorFor(last, "next"),
      },
    })
  })

  // ── C class: needs directory ───────────────────────────────────
  routes.post("/api/session/:id/prompt", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, c.req.raw.body, directory, workspaceId)
  })

  routes.post("/api/session/:id/abort", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, directory, workspaceId)
  })

  routes.post("/api/session/:id/fork", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, c.req.raw.body, directory, workspaceId)
  })

  routes.post("/api/session/:id/compact", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, c.req.raw.body, directory, workspaceId)
  })

  routes.get("/api/session/:id/context", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, directory, workspaceId)
  })

  // ── C class: workspace only ────────────────────────────────────
  routes.post("/api/session/:id/wait", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, undefined, workspaceId)
  })

  routes.patch("/api/session/:id", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "PATCH", c.req.raw.headers, c.req.raw.body, undefined, workspaceId)
  })

  routes.delete("/api/session/:id", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "DELETE", c.req.raw.headers, null, undefined, workspaceId)
  })

  // ── E class: SSE ──────────────────────────────────────────────
  routes.get("/api/event", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, undefined, workspaceId)
  })

  return routes
}

export const proxyRoutes = createProxyRoutes()
