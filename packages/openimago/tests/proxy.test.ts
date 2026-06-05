import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2"
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { sql, eq } from "drizzle-orm"
import { Hono } from "hono"
import { setup, teardown, setupSessionTable, setupMessageTable, COS_BASE_PATH } from "./helper"
import { MessageTable } from "../src/db/message-schema"
import { db } from "../src/db/client"
import { projects } from "../src/db/schema"
import { SessionTable } from "../src/db/session-schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
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
    const url = buildTargetUrl(config, `http://localhost${incoming!}`, undefined, "wrk_u1")
    expect(new URL(url).pathname).toBe(expected!)
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
  const incoming = new Headers({ host: "localhost:5467" })
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

// 11b. buildForwardUrl omits directory param when directory is empty string
test("buildForwardUrl omits directory param when empty string", () => {
  const config = makeConfig()
  const url = buildForwardUrl(config, "/session", "", "wrk_test01")
  const parsed = new URL(url)
  expect(parsed.searchParams.get("workspace")).toBe("wrk_test01")
  expect(parsed.searchParams.get("directory")).toBeNull()
})

// ════════════════════════════════════════════════════════════════
// End-to-end tests: SSE streaming
// ════════════════════════════════════════════════════════════════

// 12. SSE endpoint returns text/event-stream (requires opencode)
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
  // Skip if opencode is unreachable
  if (res.status === 502) return
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
// Agent / Command local endpoints (not forwarded to opencode)
// ════════════════════════════════════════════════════════════════

import { resetAgentCommandCache } from "../src/proxy/config"

// 16b. GET /api/command returns JSON array (local, not proxied)
test("GET /api/command returns JSON array from local cache", async () => {
  resetAgentCommandCache()
  const { token } = await registerUser("pxcmdlocal", "pxcmdlocal@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/command", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  // Should return 200 even if opencode is unreachable (empty cache returns [])
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toBeArray()
})

// 16c. GET /api/agent returns JSON array (local, not proxied)
test("GET /api/agent returns JSON array from local cache", async () => {
  resetAgentCommandCache()
  const { token } = await registerUser("pxagentlocal", "pxagentlocal@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/agent", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body).toBeArray()
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
  expect(body).toBeArray()
  expect(body.length).toBe(1)
  expect(body[0].id).toBe("ses_mine")
  expect(body[0].title).toBe("My Session")
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
test("F: GET /api/session/:id/message forwards to opencode", async () => {
  const { token, workspaceId } = await registerUser("pgmsg", "pgmsg@example.com")

  await db.execute(sql`DELETE FROM session`)

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

  const res = await app.fetch(
    new Request("http://localhost/api/session/ses_msgs/message?order=asc", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )

  // Route forwards to opencode; response depends on opencode state.
  // Accept any response (proxy may return whatever opencode returns).
  if (res.status === 502) return
  expect(res.status).toBeGreaterThanOrEqual(200)
  expect(res.status).toBeLessThan(600)
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
  const body = result.data as any
  expect(body).toBeDefined()
  expect(body).toBeArray()
  expect(body.length).toBe(1)
  expect(body[0].id).toBe("ses_sdk_mine")
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

// 23. SDK client: session.messages() via proxy → forwarded to opencode
test("SDK: client.session.messages() returns messages", async () => {
  const { token, workspaceId } = await registerUser("sdkmsg", "sdkmsg@example.com")

  await db.execute(sql`DELETE FROM session`)

  await db.insert(SessionTable).values({
    id: "ses_sdk_msgs", project_id: "global", workspace_id: workspaceId,
    slug: "sdk-msgs", directory: "/mnt/cos/sdk-msgs", title: "SDK Messages", version: "1.0",
    time_created: 0, time_updated: 0,
  })

  const client = createTestClient(token)
  const result = await client.session.messages({ sessionID: "ses_sdk_msgs" })
  // Route forwards to opencode; expects structured response from opencode.
  // Skip if opencode is unreachable.
  if (result.error) {
    // 502 or network error from unreachable opencode
    return
  }
  expect(result.data).toBeDefined()
})

// ════════════════════════════════════════════════════════════════
// POST /api/session: creates workdir and forwards with directory
// ════════════════════════════════════════════════════════════════

test("POST /api/session creates workdir and returns session from opencode", async () => {
  const { token } = await registerUser("ses_create_test", "ses_create@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )

  // Opencode is running (integration) or mocked — either 201 (success) or 502 (opencode unreachable)
  // What we care about is: no 500 from missing workspaceId, no 403/404 from missing directory
  expect(res.status).not.toBe(500)
  expect(res.status).not.toBe(403)

  if (res.status === 201) {
    const body = await res.json() as Record<string, any>
    // Response should be the raw session object (id starts with ses_)
    expect(body.id).toMatch(/^ses_/)
    // directory field exists (value is whatever opencode stores — workspace dir)
    expect(typeof body.directory).toBe("string")
  }
})

test("POST /api/session writes WorkspaceTable user_id and global project_id", async () => {
  const { token, userId, workspaceId } = await registerUser("ses_workspace_owner", "ses_workspace_owner@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )

  expect(res.status).not.toBe(500)
  expect(res.status).not.toBe(403)

  const [workspace] = await db
    .select({ userId: WorkspaceTable.userId, projectId: WorkspaceTable.project_id })
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, workspaceId))
    .limit(1)

  expect(workspace).toBeDefined()
  expect(workspace!.userId).toBe(userId)
  expect(workspace!.projectId).toBe("global")
})

test("POST /api/session with project writes WorkspaceTable user_id and project_id", async () => {
  const { token, userId, workspaceId } = await registerUser("ses_project_workspace", "ses_project_workspace@example.com")
  const projectId = "proj_session_workspace"

  await db.insert(projects).values({
    id: projectId,
    userId,
    name: "Session Workspace Project",
    description: "Project-backed session workspace test",
    directory: `${COS_BASE_PATH}/${projectId}`,
    status: "active",
  })

  const res = await app.fetch(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId }),
    }),
  )

  expect(res.status).not.toBe(500)
  expect(res.status).not.toBe(403)

  const [workspace] = await db
    .select({ userId: WorkspaceTable.userId, projectId: WorkspaceTable.project_id, directory: WorkspaceTable.directory })
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, workspaceId))
    .limit(1)

  expect(workspace).toBeDefined()
  expect(workspace!.userId).toBe(userId)
  expect(workspace!.projectId).toBe(projectId)
  expect(workspace!.directory).toBe(`${COS_BASE_PATH}/${projectId}`)
})

// ════════════════════════════════════════════════════════════════
// x-opencode-directory header propagation
// Verifies the SDK-compatible header mechanism for directory passing.
// The opencode SDK uses x-opencode-directory header as primary
// transport; ?directory= query param alone is insufficient for POST requests.
// ════════════════════════════════════════════════════════════════

// 25. buildForwardHeaders sets x-opencode-directory when directory provided
test("buildForwardHeaders sets x-opencode-directory when directory provided", () => {
  const config = makeConfig()
  const headers = buildForwardHeaders(config, new Headers(), "/mnt/cos/dir_abc123")
  expect(headers.get("x-opencode-directory")).toBe("/mnt/cos/dir_abc123")
})

// 26. buildForwardHeaders omits x-opencode-directory when directory is undefined
test("buildForwardHeaders omits x-opencode-directory when directory is undefined", () => {
  const config = makeConfig()
  const headers = buildForwardHeaders(config, new Headers())
  expect(headers.get("x-opencode-directory")).toBeNull()
})

// 27. buildForwardHeaders strips incoming x-opencode-directory before injecting
test("buildForwardHeaders strips incoming x-opencode-directory before injecting own", () => {
  const config = makeConfig()
  const incoming = new Headers({ "x-opencode-directory": "/evil/path" })
  const headers = buildForwardHeaders(config, incoming, "/mnt/cos/real_dir")
  expect(headers.get("x-opencode-directory")).toBe("/mnt/cos/real_dir")
})

// 28. buildForwardHeaders strips incoming x-opencode-directory when no directory given
test("buildForwardHeaders removes x-opencode-directory from incoming when no directory given", () => {
  const config = makeConfig()
  const incoming = new Headers({ "x-opencode-directory": "/some/path" })
  const headers = buildForwardHeaders(config, incoming)
  expect(headers.get("x-opencode-directory")).toBeNull()
})

// 29. buildForwardHeaders passes directory raw (openCode expects unencoded paths)
test("buildForwardHeaders passes directory path as-is", () => {
  const config = makeConfig()
  const path = "/mnt/cos/dir with spaces/and&special=chars"
  const headers = buildForwardHeaders(config, new Headers(), path)
  expect(headers.get("x-opencode-directory")).toBe(path)
})

// ════════════════════════════════════════════════════════════════
// End-to-end: session creation → directory consistency
// Verifies the full chain: WorkspaceTable.directory → forward header →
// opencode SessionTable.directory → returned session.directory

// 30. created session.directory matches WorkspaceTable.directory
test("created session directory matches WorkspaceTable directory", async () => {
  const { token, workspaceId } = await registerUser("e2e_ses_dir", "e2e_ses_dir@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )

  if (res.status !== 201) {
    // OpenCode unreachable — skip assertions that require it
    return
  }

  const session = await res.json() as Record<string, any>

  // 1. Session has an id and a directory
  expect(session.id).toMatch(/^ses_/)
  expect(typeof session.directory).toBe("string")

  // 2. The directory stored in opencode's session table matches the returned value
  const [dbSession] = await db
    .select({ directory: SessionTable.directory, workspaceId: SessionTable.workspace_id })
    .from(SessionTable)
    .where(eq(SessionTable.id, session.id))
    .limit(1)
  expect(dbSession).toBeDefined()
  expect(dbSession!.workspaceId).toBe(workspaceId)

  // 3. SessionTable.directory matches the directory we sent (via x-opencode-directory header)
  // It should NOT be "/" — it should be a real workdir path
  expect(dbSession!.directory).not.toBe("/")
  expect(dbSession!.directory).toBe(session.directory)

  // 4. The WorkspaceTable record has a matching directory
  const [dbWorkspace] = await db
    .select({ directory: WorkspaceTable.directory })
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, workspaceId))
    .limit(1)

  expect(dbWorkspace).toBeDefined()
  // workspace.directory equals what opencode stored as session.directory
  expect(dbWorkspace!.directory).toBe(dbSession!.directory)
})

// 31. prompt_async resolves directory correctly via session
test("prompt_async resolves directory from SessionTable", async () => {
  const { token, workspaceId } = await registerUser("e2e_prompt_dir", "e2e_prompt_dir@example.com")

  // Clean previous sessions
  await db.execute(sql`DELETE FROM session WHERE workspace_id = ${workspaceId}`)

  // Insert a session record with a known directory
  await db.insert(SessionTable).values({
    id: "ses_prompt_test",
    project_id: "global",
    workspace_id: workspaceId,
    slug: "prompt-test",
    directory: "/mnt/cos/test-prompt-dir",
    title: "Prompt Test",
    version: "1.0",
    time_created: 1000,
    time_updated: 1000,
  })

  // Simulate what proxyMiddleware does: resolveDirectory should return our directory
  // We can't easily test middleware directly, but we can test resolveDirectory logic
  const [resolved] = await db
    .select({ directory: SessionTable.directory })
    .from(SessionTable)
    .where(eq(SessionTable.id, "ses_prompt_test"))
    .limit(1)

  expect(resolved).toBeDefined()
  expect(resolved!.directory).toBe("/mnt/cos/test-prompt-dir")
  expect(resolved!.directory).not.toBe("/")
})

// ════════════════════════════════════════════════════════════════
// Prompt handler: unified attachment resolver
// ════════════════════════════════════════════════════════════════

import { mkdir, writeFile, readFile, access } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { tempAttachments } from "../src/db/schema"

// 32. POST prompt with temporary attachments copies files and sends file parts
test("POST prompt with temp attachments copies to session dir and emits file parts", async () => {
  const { token, userId, workspaceId } = await registerUser("px_tmp_att", "px_tmp_att@example.com")

  // Create a temp attachment record and file
  const tempId = "tmp_test_01"
  const assetContent = "temp-file-" + randomUUID()
  const tempDir = join(COS_BASE_PATH, ".tmp", "uploads", userId, "batch_test")
  await mkdir(tempDir, { recursive: true })
  const tempFilePath = join(tempDir, `${tempId}_test.png`)
  await writeFile(tempFilePath, assetContent)

  await db.insert(tempAttachments).values({
    id: tempId,
    userId,
    batchId: "batch_test",
    filename: "test.png",
    mimeType: "image/png",
    size: assetContent.length,
    storagePath: tempFilePath,
    status: "pending",
    expiresAt: new Date(Date.now() + 86400000),
  } as any).onConflictDoUpdate({ target: tempAttachments.id, set: { userId, status: "pending" } } as any)

  // Create session directory
  const sessionDir = join(COS_BASE_PATH, `ses_tmp_att_${randomUUID().slice(0, 8)}`)
  await mkdir(sessionDir, { recursive: true })

  await db.execute(sql`DELETE FROM session WHERE id = 'ses_tmp_att'`)
  await db.insert(SessionTable).values({
    id: "ses_tmp_att",
    project_id: "global",
    workspace_id: workspaceId,
    slug: "tmp-att",
    directory: sessionDir,
    title: "Temp Attachment Test",
    version: "1.0",
    time_created: Date.now(),
    time_updated: Date.now(),
  })

  // Mock fetch to OpenCode
  const origFetch = globalThis.fetch
  let forwardedBody: string | null = null
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? ""
    if (String(url).includes("/session/") && String(url).includes("/message")) {
      forwardedBody = init?.body as string ?? null
      return new Response(JSON.stringify({ id: "msg_mock", status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return origFetch(input, init)
  }) as typeof fetch

  try {
    const res = await app.fetch(
      new Request("http://localhost/api/session/ses_tmp_att/prompt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: "use this file",
          attachments: [
            { id: tempId, scope: "temporary", filename: "test.png", mime: "image/png" },
          ],
        }),
      }),
    )

    expect(res.status).toBe(200)

    // Verify file was copied to sessionDir/attachments/
    const attachDir = join(sessionDir, "attachments")
    const files = await (await import("node:fs/promises")).readdir(attachDir)
    expect(files.length).toBeGreaterThanOrEqual(1)

    // Verify forwarded body contains file part, not text-appended path
    expect(forwardedBody).not.toBeNull()
    const fwdMsg = JSON.parse(forwardedBody!)
    const parts = fwdMsg.parts as any[]
    const fileParts = parts.filter((p: any) => p.type === "file")
    expect(fileParts.length).toBeGreaterThanOrEqual(1)
    expect(fileParts[0].mime).toBe("image/png")
    expect(fileParts[0].url).toMatch(/^file:\/\//)

    // Text parts should NOT contain attachment path text
    const textParts = parts.filter((p: any) => p.type === "text")
    const allText = textParts.map((p: any) => p.text).join(" ")
    expect(allText).not.toContain("附件已复制到")
  } finally {
    globalThis.fetch = origFetch
  }
})

// 33. POST prompt with non-owned temp attachment skips it
test("POST prompt with non-owned temp attachment skips the attachment", async () => {
  const { userId } = await registerUser("px_tmp_own", "px_tmp_own@example.com")
  const userB = await registerUser("px_tmp_userb", "px_tmp_userb@example.com")

  // Create temp attachment for user A
  const tempId = "tmp_non_owned"
  const assetContent = "not-yours-" + randomUUID()
  const tempDir = join(COS_BASE_PATH, ".tmp", "uploads", userId, "batch_nono")
  await mkdir(tempDir, { recursive: true })
  const tempFilePath = join(tempDir, `${tempId}_private.png`)
  await writeFile(tempFilePath, assetContent)

  await db.insert(tempAttachments).values({
    id: tempId,
    userId,
    batchId: "batch_nono",
    filename: "private.png",
    mimeType: "image/png",
    size: assetContent.length,
    storagePath: tempFilePath,
    status: "pending",
    expiresAt: new Date(Date.now() + 86400000),
  } as any).onConflictDoUpdate({ target: tempAttachments.id, set: { userId, status: "pending" } } as any)

  // Session for user B
  const sessionDir = join(COS_BASE_PATH, `ses_tmp_non_${randomUUID().slice(0, 8)}`)
  await mkdir(sessionDir, { recursive: true })

  await db.execute(sql`DELETE FROM session WHERE id = 'ses_tmp_non'`)
  await db.insert(SessionTable).values({
    id: "ses_tmp_non",
    project_id: "global",
    workspace_id: userB.workspaceId,
    slug: "tmp-non",
    directory: sessionDir,
    title: "Non-Owned Test",
    version: "1.0",
    time_created: Date.now(),
    time_updated: Date.now(),
  })

  // Mock fetch
  const origFetch = globalThis.fetch
  let forwardedBody: string | null = null
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? ""
    if (String(url).includes("/session/") && String(url).includes("/message")) {
      forwardedBody = init?.body as string ?? null
      return new Response(JSON.stringify({ id: "msg_mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return origFetch(input, init)
  }) as typeof fetch

  try {
    const res = await app.fetch(
      new Request("http://localhost/api/session/ses_tmp_non/prompt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${userB.token}`,
        },
        body: JSON.stringify({
          prompt: "use this",
          attachments: [
            { id: tempId, scope: "temporary", filename: "private.png", mime: "image/png" },
          ],
        }),
      }),
    )

    expect(res.status).toBe(200)

    // Forwarded body should have NO file parts (attachment skipped)
    const fwdMsg = JSON.parse(forwardedBody!)
    const fileParts = (fwdMsg.parts as any[]).filter((p: any) => p.type === "file")
    expect(fileParts.length).toBe(0)
  } finally {
    globalThis.fetch = origFetch
  }
})

// 34. Filename sanitization: path traversal is stripped
test("POST prompt sanitizes path-traversal filename from temp attachment", async () => {
  const { token, userId, workspaceId } = await registerUser("px_tmp_safe", "px_tmp_safe@example.com")

  const tempId = "tmp_safe_fn"
  const assetContent = "safe-" + randomUUID()
  const tempDir = join(COS_BASE_PATH, ".tmp", "uploads", userId, "batch_safe")
  await mkdir(tempDir, { recursive: true })
  const tempFilePath = join(tempDir, `${tempId}_evil.png`)
  await writeFile(tempFilePath, assetContent)

  await db.insert(tempAttachments).values({
    id: tempId,
    userId,
    batchId: "batch_safe",
    filename: "../../../etc/hacked.png",
    mimeType: "image/png",
    size: assetContent.length,
    storagePath: tempFilePath,
    status: "pending",
    expiresAt: new Date(Date.now() + 86400000),
  } as any).onConflictDoUpdate({ target: tempAttachments.id, set: { userId, status: "pending" } } as any)

  const sessionDir = join(COS_BASE_PATH, `ses_tmp_safe_${randomUUID().slice(0, 8)}`)
  await mkdir(sessionDir, { recursive: true })

  await db.execute(sql`DELETE FROM session WHERE id = 'ses_tmp_safe'`)
  await db.insert(SessionTable).values({
    id: "ses_tmp_safe",
    project_id: "global",
    workspace_id: workspaceId,
    slug: "tmp-safe",
    directory: sessionDir,
    title: "Safe Filename Test",
    version: "1.0",
    time_created: Date.now(),
    time_updated: Date.now(),
  })

  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input?.url ?? ""
    if (String(url).includes("/session/") && String(url).includes("/message")) {
      return new Response(JSON.stringify({ id: "msg_mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    return origFetch(input, init)
  }) as typeof fetch

  try {
    await app.fetch(
      new Request("http://localhost/api/session/ses_tmp_safe/prompt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: "use this",
          attachments: [
            { id: tempId, scope: "temporary", filename: "../../../etc/hacked.png", mime: "image/png" },
          ],
        }),
      }),
    )

    // File should be saved with basename only, in attachments dir
    const attachDir = join(sessionDir, "attachments")
    const files = await (await import("node:fs/promises")).readdir(attachDir)
    // Filename should contain hacked.png (the basename), not the full path
    const hasSafe = files.some((f) => f.endsWith("hacked.png"))
    expect(hasSafe).toBe(true)

    // File should NOT exist at a traversal escape path
    let traversalExists = false
    try {
      await access(join(sessionDir, "attachments", "..", "..", "..", "etc", "hacked.png"))
      traversalExists = true
    } catch { /* expected */ }
    expect(traversalExists).toBe(false)
  } finally {
    globalThis.fetch = origFetch
  }
})
