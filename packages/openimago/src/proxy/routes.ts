import { Hono } from "hono"
import { and, or, eq, like, isNull, gte, gt, lt, asc, desc } from "drizzle-orm"
import { mkdir } from "node:fs/promises"
import { join, basename } from "node:path"
import { authMiddleware, proxyMiddleware } from "../server/middleware"
import { proxyRequest, createProxyConfig, forward } from "./service"
import { loadAgentCommandConfig, getAgents, getCommands } from "./config"
import { db } from "../db/client"
import { SessionTable } from "../db/session-schema"
import { MessageTable } from "../db/message-schema"
import { projects } from "../db/schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { logger } from "../server/logger"
import { Effect, Fiber, Stream } from "effect"
import type { BusEvent } from "../event/types"
import { billingService } from "../billing/service"
import { resolveAttachments, type AttachmentInput } from "../attachments/resolver"
import { tempUploadService } from "../temp-uploads/service"
import { verifyJwt } from "../auth/jwt"

/**
 * Legacy callback (kept for compatibility).
 * The new handler uses EventSubscription instead.
 */
export type GetEventStream = (userId: string) => Promise<Stream.Stream<BusEvent>>

/** Returned by subscribe — stream + cleanup function */
export interface EventSubscription {
  stream: Stream.Stream<BusEvent>
  unsubscribe: () => void
}

/** Subscribe to events for a user. Returns a stream + promise-returning cleanup. */
export type SubscribeFn = (userId: string) => Promise<EventSubscription>

/** Encode a single value as an SSE data line */
function sseEncode(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

// Hono's req.raw.body is ReadableStream<any>; cast to the stricter type expected by proxyRequest
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawBody = (c: any) => c.req.raw.body as ReadableStream<Uint8Array> | null

export function createProxyRoutes(configOverrides?: { opencodeUrl?: string }, subscribe?: SubscribeFn) {
  const config = createProxyConfig(configOverrides)
  const routes = new Hono()

  routes.use("/*", authMiddleware)
  routes.use("/api/*", proxyMiddleware)

  // ── Session: create (must be before /:id routes) ──────────────
  routes.post("/api/session", async (c) => {
    const userId = c.get("userId") as string
    const workspaceId = c.get("workspaceId") as string | null

    if (!workspaceId) {
      return c.json({ error: { code: "CONFIGURATION_REQUIRED", message: "Workspace not configured" } }, 500)
    }

    // Parse optional projectId from request body
    let body: Record<string, unknown> = {}
    try { body = await c.req.json() } catch { /* empty body is fine */ }

    // Resolve working directory:
    // - Project-based sessions reuse the project's persistent directory.
    // - Standalone sessions get /{COS_BASE_PATH}/{workspaceId} (one directory per workspace).
    const projectId = body.projectId as string | undefined
    let directory: string

    if (projectId) {
      const [project] = await db
        .select({ directory: projects.directory })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        .limit(1)
      if (!project) {
        return c.json({ error: { code: "NOT_FOUND", message: "Project not found" } }, 404)
      }
      directory = project.directory
    } else {
      directory = `${COS_BASE_PATH}/${workspaceId}`
      await mkdir(directory, { recursive: true })
    }

    logger.info({ userId, directory, projectId }, "proxy: creating opencode session")

    // Ensure the opencode workspace has the correct directory.
    // Opencode's planRequest() uses workspace.directory for local workspace routing;
    // ?directory= query param and x-opencode-directory header are ignored when a
    // workspace exists. We must set workspace.directory before session creation
    // so that SessionTable.directory is stored with the correct path.
    await db
      .insert(WorkspaceTable)
      .values({
        id: workspaceId,
        type: "worktree",
        name: "default",
        directory,
        project_id: body.projectId ? String(body.projectId) : "global",
        time_used: Date.now(),
        userId,
      })
      .onConflictDoUpdate({
        target: WorkspaceTable.id,
        set: { directory, type: "worktree", userId },
      })

    // Forward to opencode with real directory
    const sessionRes = await forward(config, {
      method: "POST",
      path: "/session",
      directory,
      workspaceId,
      body,
    })

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({}))
      return c.json(err, sessionRes.status as any)
    }

    // Return raw session so the SDK can parse it directly
    const session = await sessionRes.json()
    return c.json(session, 201 as any)
  })

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
      return c.json([])
    }

    const conditions: any[] = [
      eq(SessionTable.workspace_id, workspaceId),
    ]

    // Scope to a single project when requested. All of a user's projects share
    // one workspace, so without this the list leaks sessions across projects.
    const requestedProject = filters.projectId ?? filters.project_id
    if (requestedProject) conditions.push(eq(SessionTable.project_id, requestedProject))

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

    const nextCursor = cursorFor(last, "next")
    const prevCursor = cursorFor(first, "previous")
    const res = c.json(items)
    if (nextCursor) res.headers.set("X-Cursor-Next", nextCursor)
    if (prevCursor) res.headers.set("X-Cursor-Previous", prevCursor)
    return res
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
    const workspaceId = c.get("workspaceId") as string
    const sessionId = c.req.param("id")

    // Verify session belongs to this workspace before forwarding
    const [session] = await db
      .select({ id: SessionTable.id })
      .from(SessionTable)
      .where(and(eq(SessionTable.id, sessionId), eq(SessionTable.workspace_id, workspaceId)))
      .limit(1)
    if (!session) return c.json({ error: { code: "NOT_FOUND", message: "Session not found" } }, 404)

    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, directory, workspaceId)
  })

  // ── C class: needs directory ───────────────────────────────────
  // /api/session/:id/prompt → opencode POST /session/:id/message
  // Converts {prompt: string} → {parts: [{type:"text", text}]}
  routes.post("/api/session/:id/prompt", async (c) => {
    const userId = c.get("userId") as string
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    const id = c.req.param("id")

    // Check billing balance before forwarding
    const balanceCheck = await billingService.checkBalance(userId)
    if (!balanceCheck.allowed) {
      return c.json({
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: "Insufficient balance. Please recharge your account.",
          balanceMicros: balanceCheck.account?.balanceMicros ?? 0,
          minimumBalanceMicros: balanceCheck.account?.minimumBalanceMicros ?? 0,
        },
      }, 402 as any)
    }

    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON body" } }, 400)
    }

    const prompt = typeof body.prompt === "string" ? body.prompt : ""

    // ── Resolve attachments (unified strategy) ──────────────────
    const rawAttachments = body.attachments
    const attachmentInputs: AttachmentInput[] = []
    if (Array.isArray(rawAttachments)) {
      for (const a of rawAttachments) {
        if (
          typeof a === "object" &&
          a !== null &&
          typeof (a as any).id === "string" &&
          typeof (a as any).scope === "string" &&
          typeof (a as any).filename === "string" &&
          typeof (a as any).mime === "string"
        ) {
          attachmentInputs.push({
            id: (a as any).id as string,
            scope: (a as any).scope as AttachmentInput["scope"],
            filename: (a as any).filename as string,
            mime: (a as any).mime as string,
          })
        }
      }
    }

    const ctx = { userId, sessionDirectory: directory, workspaceId }
    const fileParts = await resolveAttachments(attachmentInputs, ctx)

    // Mark resolved temporary attachments as consumed
    for (const input of attachmentInputs) {
      if (input.scope === "temporary") {
        try {
          await tempUploadService.markConsumed(input.id)
        } catch {
          logger.warn({ attachmentId: input.id }, "proxy: failed marking temp attachment consumed")
        }
      }
    }

    // Build OpenCode parts: text + resolved file parts
    const parts: Array<Record<string, unknown>> = []
    if (prompt) {
      parts.push({ type: "text", text: prompt })
    }
    for (const fp of fileParts) {
      parts.push({ type: "file", mime: fp.mime, filename: fp.filename, url: fp.url })
    }
    const messageBody = JSON.stringify({ parts })

    // Build target URL: /session/:id/message with workspace/directory params
    const targetUrl = new URL(`/session/${id}/message`, config.opencodeUrl)
    targetUrl.searchParams.set("workspace", workspaceId)
    if (directory) targetUrl.searchParams.set("directory", directory)

    const headers = new Headers()
    headers.set("content-type", "application/json")
    headers.set("authorization", `Basic ${config.basicAuth}`)

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "POST",
        headers,
        body: messageBody,
      })
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      })
    } catch {
      return c.json({ error: { code: "OPENCODE_UNREACHABLE", message: "OpenCode service unavailable" } }, 502)
    }
  })

  routes.post("/api/session/:id/abort", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, directory, workspaceId)
  })

  routes.post("/api/session/:id/fork", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
  })

  routes.post("/api/session/:id/compact", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
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
    return proxyRequest(config, c.req.url, "PATCH", c.req.raw.headers, rawBody(c), undefined, workspaceId)
  })

  routes.delete("/api/session/:id", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "DELETE", c.req.raw.headers, null, undefined, workspaceId)
  })

  // ── Session: prompt_async (SDK primary send path) ─────────────
  routes.post("/api/session/:id/prompt_async", async (c) => {
    const userId = c.get("userId") as string
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string

    const balanceCheck = await billingService.checkBalance(userId)
    if (!balanceCheck.allowed) {
      return c.json({
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: "Insufficient balance. Please recharge your account.",
          balanceMicros: balanceCheck.account?.balanceMicros ?? 0,
          minimumBalanceMicros: balanceCheck.account?.minimumBalanceMicros ?? 0,
        },
      }, 402 as any)
    }

    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
  })

  // ── Session: slash command ─────────────────────────────────────
  routes.post("/api/session/:id/command", async (c) => {
    const userId = c.get("userId") as string
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string

    const balanceCheck = await billingService.checkBalance(userId)
    if (!balanceCheck.allowed) {
      return c.json({
        error: {
          code: "INSUFFICIENT_BALANCE",
          message: "Insufficient balance. Please recharge your account.",
          balanceMicros: balanceCheck.account?.balanceMicros ?? 0,
          minimumBalanceMicros: balanceCheck.account?.minimumBalanceMicros ?? 0,
        },
      }, 402 as any)
    }

    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
  })

  // ── Session: revert / unrevert ────────────────────────────────
  routes.post("/api/session/:id/revert", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
  })

  routes.post("/api/session/:id/unrevert", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, undefined, workspaceId)
  })

  // ── Session: summarize (compact) ──────────────────────────────
  routes.post("/api/session/:id/summarize", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), directory, workspaceId)
  })

  // ── Session: todo list ────────────────────────────────────────
  routes.get("/api/session/:id/todo", (c) => {
    const workspaceId = c.get("workspaceId") as string
    const directory = c.get("directory") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, directory, workspaceId)
  })

  // ── E class: SSE ──────────────────────────────────────────────
  routes.get("/api/event", async (c) => {
    const userId = c.get("userId") as string | undefined
    const workspaceId = c.get("workspaceId") as string
    const token = c.get("token") as string | undefined

    // If the GlobalEventManager is running, use it for fan-out
    if (subscribe && userId) {
      logger.info({ userId }, "/api/event: connecting via GlobalEventManager")

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const encoder = new TextEncoder()

      // Subscribe: creates a per-user stream, returns stream + idempotent cleanup
      const subscription = await subscribe(userId)
      const { stream: busStream } = subscription
      // Guard against double-call (abort signal + Effect.ensuring both trigger cleanup)
      let _unsubscribed = false
      const unsubscribe = () => {
        if (_unsubscribed) return
        _unsubscribed = true
        subscription.unsubscribe()
      }
      let streamFiber: ReturnType<typeof Effect.runFork> | null = null
      let _cleanedUp = false
      const cleanupSse = (interruptFiber: boolean) => {
        if (_cleanedUp) return
        _cleanedUp = true
        if (jwtCheckTimer) clearInterval(jwtCheckTimer)
        jwtCheckTimer = null
        unsubscribe()
        writer.close().catch(() => {})
        if (interruptFiber && streamFiber) {
          const fiber = streamFiber
          streamFiber = null
          Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {})
        }
      }

      // ── JWT heartbeat: periodically verify the token is still valid ──────
      let jwtCheckTimer: ReturnType<typeof setInterval> | null = null
      if (token) {
        jwtCheckTimer = setInterval(async () => {
          try {
            await verifyJwt(token)
          } catch {
            // Token expired or invalid — signal the client and close the stream
            logger.warn({ userId }, "/api/event: token expired during stream")
            try {
              await writer.write(encoder.encode(sseEncode({
                id: crypto.randomUUID(),
                type: "auth.expired",
                properties: {},
              })))
            } catch { /* writer may already be closed */ }
            cleanupSse(true)
          }
        }, 10_000)
      }

      // Build SSE stream: connected event + bus events + heartbeat
      const heartbeat = Stream.repeatEffect(
        Effect.gen(function* () {
          yield* Effect.sleep("10 seconds")
          return { id: crypto.randomUUID(), type: "server.heartbeat", properties: {} }
        }),
      )

      const sseStream = Stream.make({
        id: crypto.randomUUID(),
        type: "server.connected",
        properties: {},
      }).pipe(
        Stream.concat(Stream.merge(busStream, heartbeat, { haltStrategy: "left" })),
        Stream.map((data) => encoder.encode(sseEncode(data))),
      )

      // Run the stream, piping chunks to the writer
      streamFiber = Effect.runFork(
        sseStream.pipe(
          Stream.runForEach((chunk) =>
            Effect.tryPromise({
              try: () => writer.write(chunk),
              catch: () => new Error("write failed"),
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              cleanupSse(false)
            }),
          ),
        ),
      )

      // Clean up on client disconnect
      c.req.raw.signal.addEventListener("abort", () => {
        cleanupSse(true)
      }, { once: true })

      return c.body(readable, 200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      })
    }

    // Legacy fallback: proxy directly to opencode /event (old behavior)
    logger.warn({ workspaceId }, "/api/event: GlobalEventManager not available, falling back to proxy")
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, undefined, workspaceId)
  })

  // ── Command / Agent (local cache, not forwarded) ─────────────
  // These are configuration endpoints — openimago fetches the data
  // from opencode once and caches it in memory. Subsequent requests
  // are served locally without forwarding to opencode.
  routes.get("/api/command", async (c) => {
    // Lazy-load on first request; subsequent requests use cache
    if (getCommands(config).length === 0) {
      await loadAgentCommandConfig(config)
    }
    return c.json(getCommands(config))
  })

  routes.get("/api/agent", async (c) => {
    if (getAgents(config).length === 0) {
      await loadAgentCommandConfig(config)
    }
    return c.json(getAgents(config))
  })

  routes.get("/api/question", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, undefined, workspaceId)
  })

  routes.post("/api/question/:requestId/reply", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), undefined, workspaceId)
  })

  routes.post("/api/question/:requestId/reject", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, null, undefined, workspaceId)
  })

  routes.get("/api/permission", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "GET", c.req.raw.headers, null, undefined, workspaceId)
  })

  routes.post("/api/permission/:requestId/reply", (c) => {
    const workspaceId = c.get("workspaceId") as string
    return proxyRequest(config, c.req.url, "POST", c.req.raw.headers, rawBody(c), undefined, workspaceId)
  })

  return routes
}

export const proxyRoutes = createProxyRoutes()
