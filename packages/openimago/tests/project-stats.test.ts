import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { setup, teardown, setupSessionTable, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { db } from "../src/db/client"
import { SessionTable } from "../src/db/session-schema"

let app: Hono

async function registerUser(username: string, email: string): Promise<{ token: string; workspaceId: string | null }> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return { token: body.token, workspaceId: body.user?.workspaceId ?? null }
}

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
})

afterAll(async () => {
  await teardown()
  // Clean up session table
  await db.delete(SessionTable)
})

// Helper: create a project
async function createProject(token: string, name: string): Promise<string> {
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.project.id
}

// Helper: insert a session record
async function insertSession(directory: string, overrides?: Partial<typeof SessionTable.$inferInsert>) {
  const id = `ses_${crypto.randomUUID().slice(0, 8)}`
  await db.insert(SessionTable).values({
    id,
    project_id: "global",
    directory,
    slug: "",
    title: "Test Session",
    version: "",
    tokens_input: overrides?.tokens_input ?? 1000,
    tokens_output: overrides?.tokens_output ?? 500,
    tokens_reasoning: overrides?.tokens_reasoning ?? 0,
    tokens_cache_read: overrides?.tokens_cache_read ?? 0,
    tokens_cache_write: overrides?.tokens_cache_write ?? 0,
    cost: overrides?.cost ?? 0.05,
    time_created: Date.now(),
    time_updated: overrides?.time_updated ?? Date.now(),
    time_archived: overrides?.time_archived ?? null,
    summary_additions: 0,
    summary_deletions: 0,
    summary_files: 0,
  })
}

// ---------------------------------------------------------------------------
// 1. Get stats for project with sessions
// ---------------------------------------------------------------------------
test("GET /projects/:id/stats returns session count and token totals", async () => {
  const { token } = await registerUser("statsuser1", "stats1@example.com")
  const projId = await createProject(token, "Stats Project")

  // Get the project's full path
  const listRes = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const listBody = await listRes.json() as Record<string, any>
  const project = listBody.projects.find((p: any) => p.id === projId)
  const directory = project.fullPath

  await insertSession(directory, { tokens_input: 2000, tokens_output: 800, cost: 0.1 })
  await insertSession(directory, { tokens_input: 3000, tokens_output: 1200, cost: 0.15 })

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/stats`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.stats.sessionCount).toBe(2)
  expect(body.stats.totalTokensInput).toBe(5000)
  expect(body.stats.totalTokensOutput).toBe(2000)
  expect(body.stats.totalCost).toBe(0.25)
  expect(body.stats.lastActivityAt).toBeDefined()
})

// ---------------------------------------------------------------------------
// 2. Get stats for project without sessions → zeros
// ---------------------------------------------------------------------------
test("GET /projects/:id/stats with no sessions returns zeros", async () => {
  const { token } = await registerUser("statsuser2", "stats2@example.com")
  const projId = await createProject(token, "Empty Project")

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/stats`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.stats.sessionCount).toBe(0)
  expect(body.stats.totalTokensInput).toBe(0)
  expect(body.stats.totalCost).toBe(0)
  expect(body.stats.lastActivityAt).toBeNull()
})

// ---------------------------------------------------------------------------
// 3. Stats exclude archived sessions
// ---------------------------------------------------------------------------
test("GET /projects/:id/stats excludes archived sessions", async () => {
  const { token } = await registerUser("statsuser3", "stats3@example.com")
  const projId = await createProject(token, "Archived Project")

  const listRes = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const listBody = await listRes.json() as Record<string, any>
  const project = listBody.projects.find((p: any) => p.id === projId)
  const directory = project.fullPath

  await insertSession(directory, { tokens_input: 1000, cost: 0.05 })
  await insertSession(directory, { tokens_input: 2000, cost: 0.1, time_archived: BigInt(Date.now()) })

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/stats`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.stats.sessionCount).toBe(1)
  expect(body.stats.totalTokensInput).toBe(1000)
  expect(body.stats.totalCost).toBe(0.05)
})

// ---------------------------------------------------------------------------
// 4. Project not belonging to user → 403
// ---------------------------------------------------------------------------
test("getting stats for another user's project returns 403", async () => {
  const { token: tokenA } = await registerUser("statsA", "statsA@example.com")
  const projId = await createProject(tokenA, "A's Stats Project")

  const { token: tokenB } = await registerUser("statsB", "statsB@example.com")

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/stats`, {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  )
  expect(res.status).toBe(403)
})

// ---------------------------------------------------------------------------
// 5. Project not found → 404
// ---------------------------------------------------------------------------
test("stats for non-existent project returns 404", async () => {
  const { token } = await registerUser("statsuser5", "stats5@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_nonexistent/stats", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 6. Project list includes sessionCount and lastActivityAt
// ---------------------------------------------------------------------------
test("project list includes sessionCount and lastActivityAt", async () => {
  const { token } = await registerUser("statslist", "statslist@example.com")
  const projId = await createProject(token, "List Stats Project")

  const listRes = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const listBody = await listRes.json() as Record<string, any>
  const project = listBody.projects.find((p: any) => p.id === projId)
  const directory = project.fullPath

  await insertSession(directory, { tokens_input: 500, cost: 0.02 })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  const p = body.projects.find((p: any) => p.id === projId)
  expect(p).toBeDefined()
  expect(typeof p.sessionCount).toBe("number")
  expect(p.sessionCount).toBeGreaterThanOrEqual(1)
  expect(typeof p.totalCost).toBe("number")
  expect(p.totalCost).toBeGreaterThanOrEqual(0)
})

// ---------------------------------------------------------------------------
// 7. Total cost aggregation correct
// ---------------------------------------------------------------------------
test("GET /projects/:id/stats totalCost sums correctly across sessions", async () => {
  const { token } = await registerUser("statscost", "statscost@example.com")
  const projId = await createProject(token, "Cost Project")

  const listRes = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const listBody = await listRes.json() as Record<string, any>
  const project = listBody.projects.find((p: any) => p.id === projId)
  const directory = project.fullPath

  await insertSession(directory, { cost: 0.05 })
  await insertSession(directory, { cost: 0.15 })
  await insertSession(directory, { cost: 0.008 }) // 3 decimal places

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/stats`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  // 0.05 + 0.15 + 0.008 = 0.208
  expect(body.stats.totalCost).toBeCloseTo(0.208, 3)
})
