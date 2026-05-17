import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { setup, teardown, setupSessionTable, setupMessageTable } from "./helper"
import { MessageTable } from "../src/db/message-schema"
import { db } from "../src/db/client"
import { SessionTable } from "../src/db/session-schema"
import { authRoutes } from "../src/auth/routes"
import { createProxyRoutes } from "../src/proxy/routes"

let app: Hono
let mockServer: ReturnType<typeof Bun.serve>
let mockRequests: Array<{ url: string; headers: Record<string, string>; method: string; body: string | null }>

const MOCK_PORT = 15433
const MOCK_URL = `http://localhost:${MOCK_PORT}`

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  await setupMessageTable()

  mockRequests = []

  mockServer = Bun.serve({
    port: MOCK_PORT,
    async fetch(req) {
      const url = new URL(req.url)
      const headers: Record<string, string> = {}
      req.headers.forEach((value, key) => { headers[key] = value })

      let body: string | null = null
      if (req.method !== "GET" && req.method !== "HEAD") {
        body = await req.text()
      }

      mockRequests.push({ url: req.url, headers, method: req.method, body })

      if (url.pathname === "/event") {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: hello\n\n"))
            controller.enqueue(new TextEncoder().encode("data: world\n\n"))
            controller.close()
          },
        })
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        })
      }

      return new Response(JSON.stringify({ echo: true, path: url.pathname, query: Object.fromEntries(url.searchParams) }), {
        headers: { "content-type": "application/json" },
      })
    },
  })

  const proxyRoutes = createProxyRoutes({ opencodeUrl: MOCK_URL })
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/", proxyRoutes)
}, 30000)

afterAll(async () => {
  mockServer?.stop()
  await db.execute(sql`DELETE FROM session`)
  await teardown()
})

async function registerUser(username: string, email: string): Promise<{ token: string; userId: string }> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return { token: body.token as string, userId: body.user.id as string }
}

// 1. Proxy injects workspace param — use E class route (still forwards)
test("proxy injects workspace param for event route", async () => {
  const { token } = await registerUser("pxevworkspace", "pxevworkspace@example.com")

  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/event", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.searchParams.get("workspace")).toBeDefined()
  // GET /api/event does not need directory
  expect(mockUrl.searchParams.get("directory")).toBeNull()
})

// 3. Proxy injects Basic Auth — use E class route
test("proxy injects Basic Auth header", async () => {
  const { token } = await registerUser("pxauth", "pxauth@example.com")

  mockRequests = []

  await app.fetch(
    new Request("http://localhost/api/event", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  const mockReq = mockRequests[0]!
  expect(mockReq.headers["authorization"]).toBeDefined()
  expect(mockReq.headers["authorization"]).toMatch(/^Basic /)
})

// 4. Proxy passes through request body
test("proxy passes through request body", async () => {
  const { token, userId } = await registerUser("pxbody", "pxbody@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_body",
    project_id: "global",
    workspace_id: userId,
    slug: "bodyslug",
    directory: "/mnt/cos/bodytest",
    title: "Body Test",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const requestBody = JSON.stringify({ prompt: "Hello world" })

  await app.fetch(
    new Request("http://localhost/api/session/ses_body/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: requestBody,
    }),
  )

  const mockReq = mockRequests[0]!
  expect(mockReq.body).toBe(requestBody)
  expect(mockReq.method).toBe("POST")
  expect(new URL(mockReq.url).searchParams.get("directory")).toBe("/mnt/cos/bodytest")
})

// 5. Proxy returns OpenCode response as-is — use E class route
test("proxy returns OpenCode response as-is", async () => {
  const { token } = await registerUser("pxresp", "pxresp@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/event", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toContain("text/event-stream")
})

// 6. Proxy streams SSE response
test("proxy streams SSE response", async () => {
  const { token } = await registerUser("pxsse", "pxsse@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/event?directory=/mnt/cos/test", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
    }),
  )
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toContain("text/event-stream")

  const text = await res.text()
  expect(text).toContain("data: hello")
  expect(text).toContain("data: world")
})

// 7. Proxy returns 502 when OpenCode unreachable
test("proxy returns 502 when OpenCode is unreachable", async () => {
  const badProxyRoutes = createProxyRoutes({ opencodeUrl: "http://localhost:19999" })
  const badApp = new Hono()
  badApp.route("/auth", authRoutes)
  badApp.route("/", badProxyRoutes)

  const regRes = await badApp.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "px502d", email: "px502d@example.com", password: "password123" }),
    }),
  )
  const { token: badToken, user } = await regRes.json() as any

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_502",
    project_id: "global",
    workspace_id: user.id,
    slug: "502",
    directory: "/mnt/cos/502",
    title: "502",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await badApp.fetch(
    new Request("http://localhost/api/session/ses_502/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${badToken}`,
      },
      body: JSON.stringify({}),
    }),
  )
  expect(res.status).toBe(502)
  const body = await res.json() as Record<string, any> as any
  expect(body.error.code).toBe("OPENCODE_UNREACHABLE")
})

// 8. Proxy rejects without valid JWT
test("proxy rejects request without valid JWT", async () => {
  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/session?directory=/mnt/cos/test"),
  )
  expect(res.status).toBe(401)
  expect(mockRequests.length).toBe(0)
})

// 9. Proxy resolves directory from session table (ignores query param)
test("proxy resolves directory from session table, ignoring query param", async () => {
  const { token, userId } = await registerUser("pxresolve", "pxresolve@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_resolvetest",
    project_id: "global",
    workspace_id: userId,
    slug: "resolveslug",
    directory: "/mnt/cos/from-db",
    title: "Test",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_resolvetest/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: "hello" }),
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.searchParams.get("directory")).toBe("/mnt/cos/from-db")
  expect(mockUrl.searchParams.get("workspace")).toBe(userId)
})

// 10. Proxy returns 403 when workspace_id mismatch
test("proxy returns 403 when session workspace_id != userId", async () => {
  const { token } = await registerUser("pxowner", "pxowner@example.com")
  const { userId: otherUserId } = await registerUser("pxother", "pxother@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_otheruser",
    project_id: "global",
    workspace_id: otherUserId,
    slug: "otherslug",
    directory: "/mnt/cos/other",
    title: "Test",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_otheruser/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: "hello" }),
    }),
  )

  expect(res.status).toBe(403)
  expect(mockRequests.length).toBe(0)
})

// 11. Proxy returns 404 when session not found
test("proxy returns 404 when session not found", async () => {
  const { token } = await registerUser("px404", "px404@example.com")

  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_nonexistent/prompt", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt: "hello" }),
    }),
  )

  expect(res.status).toBe(404)
  expect(mockRequests.length).toBe(0)
})

// 12. Whitelisted route POST /api/session/:id/abort resolves directory
test("whitelisted route POST abort resolves directory", async () => {
  const { token, userId } = await registerUser("pxabort", "pxabort@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_aborttest",
    project_id: "global",
    workspace_id: userId,
    slug: "abortslug",
    directory: "/mnt/cos/abortdir",
    title: "AbortTest",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_aborttest/abort", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_aborttest/abort")
  expect(mockUrl.searchParams.get("directory")).toBe("/mnt/cos/abortdir")
  expect(mockUrl.searchParams.get("workspace")).toBe(userId)
})

// 13. Non-whitelisted routes return 404
test("non-whitelisted route returns 404", async () => {
  const { token, userId } = await registerUser("pxunknown", "pxunknown@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_unknown",
    project_id: "global",
    workspace_id: userId,
    slug: "unknownslug",
    directory: "/mnt/cos/unknown",
    title: "Unknown",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_unknown/diff", {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(404)
  expect(mockRequests.length).toBe(0)
})

// 14. C class: POST wait proxies workspace only
test("C: POST wait proxies workspace only", async () => {
  const { token } = await registerUser("pxwait", "pxwait@example.com")

  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_123/wait", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_123/wait")
  expect(mockUrl.searchParams.get("workspace")).toBeDefined()
  expect(mockUrl.searchParams.get("directory")).toBeNull()
})

// ════════════════════════════════════════════════════════════════
// F class: Direct PG queries
// ════════════════════════════════════════════════════════════════

// 15. GET /api/session returns sessions owned by userId only
test("F: GET /api/session returns sessions owned by userId", async () => {
  const { token, userId } = await registerUser("pgsesslist", "pgsesslist@example.com")
  const { userId: otherId } = await registerUser("pgsessother", "pgsessother@example.com")

  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_mine",
    project_id: "global",
    workspace_id: userId,
    slug: "mine",
    directory: "/mnt/cos/mine",
    title: "My Session",
    version: "1.0",
    time_created: 100,
    time_updated: 100,
  })

  await db.insert(SessionTable).values({
    id: "ses_theirs",
    project_id: "global",
    workspace_id: otherId,
    slug: "theirs",
    directory: "/mnt/cos/theirs",
    title: "Their Session",
    version: "1.0",
    time_created: 200,
    time_updated: 200,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.items).toBeArray()
  expect(body.items.length).toBe(1)
  expect(body.items[0].id).toBe("ses_mine")
  expect(body.items[0].title).toBe("My Session")
})

// 16. GET /api/session/:id returns session detail
test("F: GET /api/session/:id returns session detail", async () => {
  const { token, userId } = await registerUser("pgsessdet", "pgsessdet@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_detail",
    project_id: "global",
    workspace_id: userId,
    slug: "detail",
    directory: "/mnt/cos/detail",
    title: "Detail Test",
    version: "2.0",
    time_created: 1,
    time_updated: 1,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_detail", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.id).toBe("ses_detail")
  expect(body.title).toBe("Detail Test")
  expect(body.directory).toBe("/mnt/cos/detail")
})

// 17. GET /api/session/:id returns 404 if not owned
test("F: GET /api/session/:id returns 404 for other user's session", async () => {
  const { token } = await registerUser("pgsess404", "pgsess404@example.com")
  const { userId: otherId } = await registerUser("pgsess404b", "pgsess404b@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_notmine",
    project_id: "global",
    workspace_id: otherId,
    slug: "notmine",
    directory: "/mnt/cos/notmine",
    title: "Not Mine",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_notmine", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(404)
})

// 18. GET /api/session/:id/message returns messages
test("F: GET /api/session/:id/message returns messages", async () => {
  const { token, userId } = await registerUser("pgmsg", "pgmsg@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.execute(sql`DELETE FROM message`)

  await db.insert(SessionTable).values({
    id: "ses_msgs",
    project_id: "global",
    workspace_id: userId,
    slug: "msgs",
    directory: "/mnt/cos/msgs",
    title: "With Messages",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  await db.insert(MessageTable).values({
    id: "msg_1",
    session_id: "ses_msgs",
    time_created: 1,
    time_updated: 1,
    data: { role: "user", content: "hello" },
  })

  await db.insert(MessageTable).values({
    id: "msg_2",
    session_id: "ses_msgs",
    time_created: 2,
    time_updated: 2,
    data: { role: "assistant", content: "hi there" },
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_msgs/message?order=asc", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json() as any
  expect(body.items).toBeArray()
  expect(body.items.length).toBe(2)
  expect(body.items[0].id).toBe("msg_1")
  expect(body.items[1].id).toBe("msg_2")
})

// ════════════════════════════════════════════════════════════════
// C class: compact / context / patch / delete
// ════════════════════════════════════════════════════════════════

// 19. POST compact proxies with directory
test("C: POST compact proxies with directory", async () => {
  const { token, userId } = await registerUser("pxcompact", "pxcompact@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_compact",
    project_id: "global",
    workspace_id: userId,
    slug: "compact",
    directory: "/mnt/cos/compactdir",
    title: "Compact",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_compact/compact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_compact/compact")
  expect(mockUrl.searchParams.get("directory")).toBe("/mnt/cos/compactdir")
  expect(mockUrl.searchParams.get("workspace")).toBe(userId)
})

// 20. GET context proxies with directory
test("C: GET context proxies with directory", async () => {
  const { token, userId } = await registerUser("pxcontext", "pxcontext@example.com")

  mockRequests = []
  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_context",
    project_id: "global",
    workspace_id: userId,
    slug: "ctx",
    directory: "/mnt/cos/ctxdir",
    title: "Context",
    version: "1.0",
    time_created: 0,
    time_updated: 0,
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_context/context", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_context/context")
  expect(mockUrl.searchParams.get("directory")).toBe("/mnt/cos/ctxdir")
  expect(mockUrl.searchParams.get("workspace")).toBe(userId)
})

// 21. PATCH session proxies workspace only (no directory)
test("C: PATCH session proxies workspace only", async () => {
  const { token } = await registerUser("pxpatch", "pxpatch@example.com")

  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_patch", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Renamed" }),
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_patch")
  expect(mockUrl.searchParams.get("workspace")).toBeDefined()
  expect(mockUrl.searchParams.get("directory")).toBeNull()
})

// 22. DELETE session proxies workspace only (no directory)
test("C: DELETE session proxies workspace only", async () => {
  const { token } = await registerUser("pxdelete", "pxdelete@example.com")

  mockRequests = []

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_del", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)

  const mockReq = mockRequests[0]!
  const mockUrl = new URL(mockReq.url)
  expect(mockUrl.pathname).toBe("/session/ses_del")
  expect(mockUrl.searchParams.get("workspace")).toBeDefined()
  expect(mockUrl.searchParams.get("directory")).toBeNull()
})
