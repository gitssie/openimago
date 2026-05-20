import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2"
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { setup, teardown, setupSessionTable, setupMessageTable } from "./helper"
import { MessageTable } from "../src/db/message-schema"
import { db } from "../src/db/client"
import { SessionTable } from "../src/db/session-schema"
import { authRoutes } from "../src/auth/routes"
import { createProxyRoutes } from "../src/proxy/routes"
import { createProxyConfig } from "../src/proxy/service"
import { buildTargetUrl, buildForwardHeaders, buildForwardUrl } from "../src/proxy/service"

let app: Hono

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096"

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  await setupMessageTable()

  const proxyRoutes = createProxyRoutes({ opencodeUrl: OPENCODE_URL })
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/", proxyRoutes)
}, 30000)

afterAll(async () => {
  await db.execute(sql`DELETE FROM session`)
  await teardown()
})

async function registerUser(username: string, email: string): Promise<{ token: string; userId: string; workspaceId: string }> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return { token: body.token as string, userId: body.user.id as string, workspaceId: body.user.workspaceId as string }
}

// ════════════════════════════════════════════════════════════════
// Pure function tests: buildTargetUrl
// ════════════════════════════════════════════════════════════════

function makeConfig(opts?: { opencodeUrl?: string }) {
  return createProxyConfig({ opencodeUrl: opts?.opencodeUrl ?? "http://opencode:3000", authUsername: "testuser", authPassword: "testpass" })
}

// 1. buildTargetUrl always injects workspace=workspaceId
test("buildTargetUrl always injects workspace=workspaceId", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/event", undefined, "wrk_abc123")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_abc123")
  expect(parsed.searchParams.get("directory")).toBeNull()
})

// 2. buildTargetUrl strips /api prefix
test("buildTargetUrl strips /api prefix", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/session/ses_123/prompt", "/mnt/cos/test", "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.pathname).toBe("/session/ses_123/prompt")
})

// 3. buildTargetUrl injects workspace and directory when provided
test("buildTargetUrl injects workspace and directory when provided", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/session/ses_123/prompt", "/mnt/cos/my-dir", "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("directory")).toBe("/mnt/cos/my-dir")
})

// 4. buildTargetUrl injects workspace even when directory is undefined
test("buildTargetUrl injects workspace even when directory is undefined", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/session/ses_123/wait", undefined, "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("directory")).toBeNull()
})

// 5. buildTargetUrl preserves other query params alongside workspace
test("buildTargetUrl preserves other query params alongside workspace", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/event?order=asc&limit=10", undefined, "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("order")).toBe("asc")
  expect(parsed.searchParams.get("limit")).toBe("10")
})

// 6. buildTargetUrl overrides incoming workspace and directory
test("buildTargetUrl overrides incoming workspace and directory", () => {
  const config = makeConfig()
  const url = buildTargetUrl(config, "http://localhost/api/event?workspace=hacker&directory=/evil", "/mnt/cos/real", "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("directory")).toBe("/mnt/cos/real")
})

// 7. buildTargetUrl uses correct pathname mapping
test("buildTargetUrl pathname mappings", () => {
  const config = makeConfig()
  const cases = [
    ["/api/event", "/event"],
    ["/api/session", "/session"],
    ["/api/session/ses_123/prompt", "/session/ses_123/prompt"],
    ["/api/session/ses_123/abort", "/session/ses_123/abort"],
    ["/api/session/ses_123/compact", "/session/ses_123/compact"],
    ["/api/session/ses_123/context", "/session/ses_123/context"],
    ["/api/session/ses_123/wait", "/session/ses_123/wait"],
    ["/api/session/ses_123/fork", "/session/ses_123/fork"],
  ]
  for (const [incoming, expected] of cases) {
    const url = buildTargetUrl(config, `http://localhost${incoming}`, undefined, "wrk_u1")
    expect(new URL(url).pathname).toBe(expected)
  }
})

// ════════════════════════════════════════════════════════════════
// Pure function tests: buildForwardHeaders
// ════════════════════════════════════════════════════════════════

// 8. buildForwardHeaders adds Basic Auth
test("buildForwardHeaders adds Basic Auth", () => {
  const config = makeConfig()
  const incoming = new Headers()
  const headers = buildForwardHeaders(config, incoming)
  expect(headers.get("Authorization")).toMatch(/^Basic /)
  expect(headers.get("Authorization")).toBe("Basic " + btoa("testuser:testpass"))
})

// 9. buildForwardHeaders strips incoming auth
test("buildForwardHeaders strips incoming Authorization", () => {
  const config = makeConfig()
  const incoming = new Headers({ authorization: "Bearer some.jwt.token" })
  const headers = buildForwardHeaders(config, incoming)
  expect(headers.get("Authorization")).toBe("Basic " + btoa("testuser:testpass"))
  expect(headers.get("Authorization")).not.toContain("Bearer")
})

// 10. buildForwardHeaders strips host
test("buildForwardHeaders strips host", () => {
  const config = makeConfig()
  const incoming = new Headers({ host: "localhost:8080" })
  const headers = buildForwardHeaders(config, incoming)
  expect(headers.get("host")).toBeNull()
})

// ════════════════════════════════════════════════════════════════
// Pure function tests: buildForwardUrl
// ════════════════════════════════════════════════════════════════

// 11. buildForwardUrl injects workspace and directory
test("buildForwardUrl injects workspace and directory", () => {
  const config = makeConfig()
  const url = buildForwardUrl(config, "/session", "/mnt/cos/test-dir", "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.pathname).toBe("/session")
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("directory")).toBe("/mnt/cos/test-dir")
})

// ════════════════════════════════════════════════════════════════
// End-to-end tests: SSE streaming
// ════════════════════════════════════════════════════════════════

// 12. SSE endpoint returns text/event-stream
test("SSE endpoint returns text/event-stream", async () => {
  const { token } = await registerUser("pxsse_e2e", "pxsse_e2e@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/event", {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "text/event-stream",
      },
    }),
  )
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toContain("text/event-stream")

  // Read first chunk of the SSE stream (real OpenCode SSE never ends)
  const reader = res.body!.getReader()
  const { value, done } = await reader.read()
  reader.cancel()

  const chunk = new TextDecoder().decode(value)
  expect(chunk).toContain("data: ")
  expect(chunk).toContain("server.connected")
})

// ════════════════════════════════════════════════════════════════
// Keep as-is: App logic tests (no OpenCode dependency)
// ════════════════════════════════════════════════════════════════

// 13. Proxy rejects request without valid JWT
test("proxy rejects request without valid JWT", async () => {
  const res = await app.fetch(
    new Request("http://localhost/api/session?directory=/mnt/cos/test"),
  )
  expect(res.status).toBe(401)
})

// 14. Proxy returns 403 when session workspace_id mismatch
test("proxy returns 403 when session workspace_id != userId", async () => {
  const { token } = await registerUser("pxowner", "pxowner@example.com")
  const { workspaceId: otherWorkspaceId } = await registerUser("pxother", "pxother@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_otheruser",
    project_id: "global",
    workspace_id: otherWorkspaceId,
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
})

// 15. Proxy returns 404 when session not found
test("proxy returns 404 when session not found", async () => {
  const { token } = await registerUser("px404", "px404@example.com")

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
})

// 16. Non-whitelisted route returns 404
test("non-whitelisted route returns 404", async () => {
  const { token, workspaceId } = await registerUser("pxunknown", "pxunknown@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_unknown",
    project_id: "global",
    workspace_id: workspaceId,
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
})

// ════════════════════════════════════════════════════════════════
// F class: Direct PG queries (keep as-is)
// ════════════════════════════════════════════════════════════════

// 17. GET /api/session returns sessions owned by userId only
test("F: GET /api/session returns sessions owned by userId", async () => {
  const { token, workspaceId } = await registerUser("pgsesslist", "pgsesslist@example.com")
  const { workspaceId: otherWorkspaceId } = await registerUser("pgsessother", "pgsessother@example.com")

  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_mine",
    project_id: "global",
    workspace_id: workspaceId,
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
    workspace_id: otherWorkspaceId,
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

// 18. GET /api/session/:id returns session detail
test("F: GET /api/session/:id returns session detail", async () => {
  const { token, workspaceId } = await registerUser("pgsessdet", "pgsessdet@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_detail",
    project_id: "global",
    workspace_id: workspaceId,
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

// 19. GET /api/session/:id returns 404 for other user's session
test("F: GET /api/session/:id returns 404 for other user's session", async () => {
  const { token } = await registerUser("pgsess404", "pgsess404@example.com")
  const { workspaceId: otherWorkspaceId } = await registerUser("pgsess404b", "pgsess404b@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_notmine",
    project_id: "global",
    workspace_id: otherWorkspaceId,
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

// 20. GET /api/session/:id/message returns messages
test("F: GET /api/session/:id/message returns messages", async () => {
  const { token, workspaceId } = await registerUser("pgmsg", "pgmsg@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.execute(sql`DELETE FROM message`)

  await db.insert(SessionTable).values({
    id: "ses_msgs",
    project_id: "global",
    workspace_id: workspaceId,
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
// SDK client tests: validate openimago proxy against OpencodeClient
// ════════════════════════════════════════════════════════════════

function createTestClient(token: string): OpencodeClient {
  return createOpencodeClient({
    baseUrl: "http://test/api",
    fetch: ((req: Request) => app.fetch(req)) as typeof fetch,
    headers: { Authorization: `Bearer ${token}` },
  })
}

// 21. SDK client: session.list() via F-class route
test("SDK: client.session.list() returns owned sessions", async () => {
  const { token, workspaceId } = await registerUser("sdksesslist", "sdksesslist@example.com")
  const { workspaceId: otherWsId } = await registerUser("sdksessother", "sdksessother@example.com")

  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_sdk_mine", project_id: "global", workspace_id: workspaceId,
    slug: "sdk-mine", directory: "/mnt/cos/sdk-mine", title: "SDK Mine", version: "1.0",
    time_created: 100, time_updated: 100,
  })

  await db.insert(SessionTable).values({
    id: "ses_sdk_theirs", project_id: "global", workspace_id: otherWsId,
    slug: "sdk-theirs", directory: "/mnt/cos/sdk-theirs", title: "SDK Theirs", version: "1.0",
    time_created: 200, time_updated: 200,
  })

  const client = createTestClient(token)
  const result = await client.session.list()
  // result.data is { items, cursor } from openimago's F-class route
  const body = result.data as any
  expect(body).toBeDefined()
  expect(body.items).toBeArray()
  expect(body.items.length).toBe(1)
  expect(body.items[0].id).toBe("ses_sdk_mine")
})

// 22. SDK client: session.get() via F-class route
test("SDK: client.session.get() returns session detail", async () => {
  const { token, workspaceId } = await registerUser("sdkget", "sdkget@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.insert(SessionTable).values({
    id: "ses_sdk_detail", project_id: "global", workspace_id: workspaceId,
    slug: "sdk-detail", directory: "/mnt/cos/sdk-detail", title: "SDK Detail", version: "2.0",
    time_created: 1, time_updated: 1,
  })

  const client = createTestClient(token)
  const result = await client.session.get({ sessionID: "ses_sdk_detail" })
  // result.data is the session object directly from openimago's route
  const body = result.data as any
  expect(body).toBeDefined()
  expect(body.id).toBe("ses_sdk_detail")
  expect(body.title).toBe("SDK Detail")
})

// 23. SDK client: session.messages() via F-class route
test("SDK: client.session.messages() returns messages", async () => {
  const { token, workspaceId } = await registerUser("sdkmsg", "sdkmsg@example.com")

  await db.execute(sql`DELETE FROM session`)
  await db.execute(sql`DELETE FROM message`)

  await db.insert(SessionTable).values({
    id: "ses_sdk_msgs", project_id: "global", workspace_id: workspaceId,
    slug: "sdk-msgs", directory: "/mnt/cos/sdk-msgs", title: "SDK Messages", version: "1.0",
    time_created: 0, time_updated: 0,
  })

  await db.insert(MessageTable).values({
    id: "msg_sdk_1", session_id: "ses_sdk_msgs",
    time_created: 1, time_updated: 1,
    data: { role: "user", content: "hello from sdk" },
  })

  await db.insert(MessageTable).values({
    id: "msg_sdk_2", session_id: "ses_sdk_msgs",
    time_created: 2, time_updated: 2,
    data: { role: "assistant", content: "hi from sdk" },
  })

  const client = createTestClient(token)
  const result = await client.session.messages({ sessionID: "ses_sdk_msgs" })
  // result.data is { items, cursor } from openimago's F-class route
  const body = result.data as any
  expect(body).toBeDefined()
  expect(body.items).toBeArray()
  expect(body.items.length).toBe(2)
  // default order is desc by time_created, so msg_sdk_2 comes first
  expect(body.items[0].id).toBe("msg_sdk_2")
  expect(body.items[1].id).toBe("msg_sdk_1")
})
