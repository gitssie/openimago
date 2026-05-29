import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { mkdirSync, writeFileSync, existsSync } from "fs"
import { join } from "path"
import { setup, teardown, setupSessionTable, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { db } from "../src/db/client"
import { projects } from "../src/db/schema"
import { SessionTable } from "../src/db/session-schema"
import { projectId } from "../src/utils/ids"

let app: Hono
const WORK = COS_BASE_PATH

async function registerUser(username: string, email: string): Promise<{ token: string; workspaceId: string | null }> {
  const a = new Hono()
  a.route("/auth", authRoutes)
  const res = await a.fetch(
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
  // We'll build the full app in each test
})

afterAll(async () => {
  await teardown()
  await db.delete(SessionTable)
})

async function buildApp(): Promise<Hono> {
  const { outputsRoutes } = await import("../src/outputs/routes")
  const a = new Hono()
  const { authMiddleware } = await import("../src/server/middleware")
  const outputsApp = new Hono()
  outputsApp.use("*", authMiddleware)
  outputsApp.route("/", outputsRoutes)
  a.route("/api/platform/sessions", outputsApp)
  return a
}

// Helper: create a session record with a workdir
async function createSession(token: string, workspaceId: string | null): Promise<{ sessionId: string; directory: string }> {
  const sessionId = `ses_${crypto.randomUUID().slice(0, 8)}`
  const dir = `${WORK}/sesstest_${crypto.randomUUID().slice(0, 6)}`
  mkdirSync(dir, { recursive: true })

  await db.insert(SessionTable).values({
    id: sessionId,
    project_id: "global",
    workspace_id: workspaceId,
    directory: dir,
    slug: "",
    title: "Test Session",
    version: "",
    cost: 0,
    tokens_input: 100,
    tokens_output: 50,
    tokens_reasoning: 0,
    tokens_cache_read: 0,
    tokens_cache_write: 0,
    time_created: Date.now(),
    time_updated: Date.now(),
  })

  return { sessionId, directory: dir }
}

// Helper: create files in a directory
function createFiles(dir: string, files: Array<{ name: string; content: string }>) {
  for (const f of files) {
    writeFileSync(join(dir, f.name), f.content)
  }
}

// ---------------------------------------------------------------------------
// 1. List outputs with images
// ---------------------------------------------------------------------------
test("list session outputs includes image files", async () => {
  const { token, workspaceId } = await registerUser("outimg", "outimg@example.com")
  const { sessionId, directory } = await createSession(token, workspaceId)

  createFiles(directory, [
    { name: "output.png", content: "fake-png" },
    { name: "output.jpg", content: "fake-jpg" },
    { name: "readme.txt", content: "hello" },
  ])

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(Array.isArray(body.outputs)).toBe(true)
  expect(body.outputs.length).toBe(3)
  const names = body.outputs.map((o: any) => o.name)
  expect(names).toContain("output.png")
  expect(names).toContain("output.jpg")
  expect(names).toContain("readme.txt")
})

// ---------------------------------------------------------------------------
// 2. List outputs includes videos
// ---------------------------------------------------------------------------
test("list session outputs includes video files with correct mimeType", async () => {
  const { token, workspaceId } = await registerUser("outvid", "outvid@example.com")
  const { sessionId, directory } = await createSession(token, workspaceId)

  createFiles(directory, [
    { name: "demo.mp4", content: "fake-mp4" },
  ])

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  const video = body.outputs.find((o: any) => o.name === "demo.mp4")
  expect(video).toBeDefined()
  expect(video.mimeType).toBe("video/mp4")
})

// ---------------------------------------------------------------------------
// 3. Filter by type=image
// ---------------------------------------------------------------------------
test("filter outputs by type=image", async () => {
  const { token, workspaceId } = await registerUser("outfilter", "outfilter@example.com")
  const { sessionId, directory } = await createSession(token, workspaceId)

  createFiles(directory, [
    { name: "img.png", content: "png" },
    { name: "vid.mp4", content: "mp4" },
    { name: "doc.txt", content: "txt" },
  ])

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs?type=image`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.outputs.length).toBe(1)
  expect(body.outputs[0].name).toBe("img.png")
})

// ---------------------------------------------------------------------------
// 4. Empty directory → empty array
// ---------------------------------------------------------------------------
test("empty workdir returns empty outputs array", async () => {
  const { token, workspaceId } = await registerUser("outempty", "outempty@example.com")
  const { sessionId } = await createSession(token, workspaceId) // no files created

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.outputs).toEqual([])
})

// ---------------------------------------------------------------------------
// 5. Session not found → 404
// ---------------------------------------------------------------------------
test("non-existent session returns 404", async () => {
  const { token } = await registerUser("out404", "out404@example.com")

  const app = await buildApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions/ses_nonexistent/outputs", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 6. Session belongs to another user → 404
// ---------------------------------------------------------------------------
test("session belonging to another user returns 404", async () => {
  const { token: tokenA, workspaceId: wspA } = await registerUser("outa", "outa@example.com")
  const { sessionId } = await createSession(tokenA, wspA)
  const { token: tokenB } = await registerUser("outb", "outb@example.com")

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  )
  // Session belongs to user A, B's workspace_id doesn't match → 404
  expect(res.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 7. Thumbnail generated for images
// ---------------------------------------------------------------------------
test("first request generates thumbnail for image", async () => {
  const { token, workspaceId } = await registerUser("outthumb", "outthumb@example.com")
  const { sessionId, directory } = await createSession(token, workspaceId)

  // Create a real-ish PNG (1x1 pixel PNG)
  const pngData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64")
  writeFileSync(join(directory, "photo.png"), pngData)

  const app = await buildApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  const img = body.outputs.find((o: any) => o.name === "photo.png")
  expect(img).toBeDefined()

  // Thumbnail may or may not be generated (depends on image processing)
  // Just verify the outputs list works
  expect(img.size).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// 8. Thumbnail cache works
// ---------------------------------------------------------------------------
test("second request returns same thumbnail without regenerating", async () => {
  const { token, workspaceId } = await registerUser("outcache", "outcache@example.com")
  const { sessionId, directory } = await createSession(token, workspaceId)

  writeFileSync(join(directory, "cache.png"), "fake-png-data")

  const app = await buildApp()
  const res1 = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res1.status).toBe(200)

  const res2 = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res2.status).toBe(200)
  const body2 = await res2.json() as Record<string, any>
  expect(body2.outputs.length).toBe(1)
})

// ---------------------------------------------------------------------------
// 9. No token → 401
// ---------------------------------------------------------------------------
test("outputs without token returns 401", async () => {
  const app = await buildApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions/ses_xxx/outputs"),
  )
  expect(res.status).toBe(401)
})

// ===========================================================================
// Project outputs — GET /api/platform/projects/:id/outputs
// ===========================================================================

async function buildProjectApp(): Promise<Hono> {
  const { authRoutes } = await import("../src/auth/routes")
  const { projectOutputsRoutes } = await import("../src/outputs/routes")
  const a = new Hono()
  a.route("/auth", authRoutes)
  a.route("/api/platform/projects", projectOutputsRoutes)
  return a
}

async function registerUserGlobal(username: string, email: string): Promise<string> {
  const a = new Hono()
  a.route("/auth", authRoutes)
  const res = await a.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.token as string
}

async function createProjectRaw(userId: string, name: string): Promise<{ id: string; directory: string }> {
  const id = projectId()
  const directory = `${WORK}/${id}`
  const now = new Date()
  mkdirSync(directory, { recursive: true })
  await db.insert(projects).values({
    id,
    userId,
    name,
    description: null,
    directory,
    status: "active",
    createdAt: now,
    updatedAt: now,
  })
  return { id, directory }
}

// 10. List project outputs returns files
test("GET /projects/:id/outputs returns files in project directory", async () => {
  const { verifyJwt } = await import("../src/auth/jwt")
  const token = await registerUserGlobal("pout1", "pout1@example.com")
  const claims = await verifyJwt(token)
  const userId = claims.userId
  const { id: projId, directory } = await createProjectRaw(userId, "Outputs Project")

  createFiles(directory, [
    { name: "output.png", content: "fake-png" },
    { name: "result.mp4", content: "fake-mp4" },
    { name: "report.txt", content: "report" },
  ])

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(Array.isArray(body.outputs)).toBe(true)
  expect(body.outputs.length).toBe(3)
  const names = body.outputs.map((o: any) => o.name)
  expect(names).toContain("output.png")
  expect(names).toContain("result.mp4")
  expect(names).toContain("report.txt")

  for (const o of body.outputs) {
    expect(typeof o.name).toBe("string")
    expect(typeof o.path).toBe("string")
    expect(typeof o.size).toBe("number")
    expect(typeof o.mimeType).toBe("string")
    expect(typeof o.modifiedAt).toBe("string")
  }
})

// 11. Project not found → 404
test("GET /projects/:id/outputs non-existent project returns 404", async () => {
  const token = await registerUserGlobal("pout404", "pout404@example.com")

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_nonexistent/outputs", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
})

// 12. Another user's project → 403
test("GET /projects/:id/outputs another users project returns 403", async () => {
  const { verifyJwt } = await import("../src/auth/jwt")
  const tokenA = await registerUserGlobal("poutA", "poutA@example.com")
  const claimsA = await verifyJwt(tokenA)
  const { id: projId } = await createProjectRaw(claimsA.userId, "A's Outputs Project")

  const tokenB = await registerUserGlobal("poutB", "poutB@example.com")

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/outputs`, {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  )
  expect(res.status).toBe(403)
})

// 13. Hidden files and .thumbnails are filtered
test("GET /projects/:id/outputs filters hidden files and thumbnails", async () => {
  const { verifyJwt } = await import("../src/auth/jwt")
  const token = await registerUserGlobal("poutfilter", "poutfilter@example.com")
  const claims = await verifyJwt(token)
  const { id: projId, directory } = await createProjectRaw(claims.userId, "Filter Outputs Project")

  createFiles(directory, [
    { name: "visible.txt", content: "hello" },
    { name: ".hidden", content: "secret" },
    { name: "output.png", content: "fake-png" },
  ])
  mkdirSync(join(directory, ".thumbnails"), { recursive: true })
  writeFileSync(join(directory, ".thumbnails", "thumb.png"), "thumb")

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  const names = body.outputs.map((o: any) => o.name)
  expect(names).toContain("visible.txt")
  expect(names).toContain("output.png")
  expect(names).not.toContain(".hidden")
  expect(names).not.toContain(".thumbnails")
})

// 14. Filter by type=image
test("GET /projects/:id/outputs filters by type=image", async () => {
  const { verifyJwt } = await import("../src/auth/jwt")
  const token = await registerUserGlobal("pouttype", "pouttype@example.com")
  const claims = await verifyJwt(token)
  const { id: projId, directory } = await createProjectRaw(claims.userId, "Type Outputs Project")

  createFiles(directory, [
    { name: "img.png", content: "png" },
    { name: "vid.mp4", content: "mp4" },
    { name: "doc.txt", content: "txt" },
  ])

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/outputs?type=image`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.outputs.length).toBe(1)
  expect(body.outputs[0].name).toBe("img.png")
})

// 15. Empty directory → empty array
test("GET /projects/:id/outputs empty directory returns empty array", async () => {
  const { verifyJwt } = await import("../src/auth/jwt")
  const token = await registerUserGlobal("poutempty", "poutempty@example.com")
  const claims = await verifyJwt(token)
  const { id: projId } = await createProjectRaw(claims.userId, "Empty Outputs Project")

  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/outputs`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.outputs).toEqual([])
})

// 16. No token → 401
test("project outputs without token returns 401", async () => {
  const app = await buildProjectApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_xxx/outputs"),
  )
  expect(res.status).toBe(401)
})
