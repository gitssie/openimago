import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { workDirRoutes } from "../src/workdir/routes"
import { stat } from "node:fs/promises"

let app: Hono
let mockServer: ReturnType<typeof Bun.serve>

const MOCK_PORT = 15434
const MOCK_URL = `http://localhost:${MOCK_PORT}`

async function registerUser(username: string, email: string): Promise<string> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.token as string
}

beforeAll(async () => {
  await setup()

  mockServer = Bun.serve({
    port: MOCK_PORT,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/session" && req.method === "POST") {
        const body = await req.json().catch(() => ({}))
        return new Response(JSON.stringify({
          id: "ses_mock_" + Date.now(),
          directory: url.searchParams.get("directory"),
          workspace_id: url.searchParams.get("workspace"),
          title: "New Session",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 })
    },
  })

  process.env.OPENCODE_URL = MOCK_URL

  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/sessions", workDirRoutes)
  app.route("/api/platform/work-dirs", workDirRoutes)
}, 30000)

afterAll(async () => {
  mockServer?.stop()
  await teardown()
})

// 1. Creating a session dir generates unique path and forwards to OpenCode
test("creating a session dir generates unique path", async () => {
  const token = await registerUser("wdsession", "wdsession@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.workDir.id).toMatch(/^dir_/)
  expect(body.workDir.fullPath).toMatch(/^\/mnt\/cos\/dir_/)
  expect(body.workDir.type).toBe("session")
  expect(body.workDir.projectId).toBeNull()
  expect(body.session).toBeDefined()
  expect(body.session.id).toMatch(/^ses_mock_/)
  expect(body.session.directory).toBe(body.workDir.fullPath)
})

// 2. Creating a session dir with projectId reuses project path
test("creating a session dir with projectId reuses project path", async () => {
  const token = await registerUser("wdproj", "wdproj@example.com")

  const projRes = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Parent Project" }),
    }),
  )
  const { project } = await projRes.json() as any

  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId: project.id }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.workDir.projectId).toBe(project.id)
  expect(body.workDir.fullPath).toBe(project.fullPath)
  expect(body.session).toBeDefined()
  expect(body.session.directory).toBe(project.fullPath)
})

// 3. Creating a session dir creates the directory
test("creating a session dir creates the directory", async () => {
  const token = await registerUser("wddir", "wddir@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    }),
  )
  const body = await res.json() as Record<string, any>
  const dirStat = await stat(body.workDir.fullPath)
  expect(dirStat.isDirectory()).toBe(true)
  expect(body.session).toBeDefined()
})

// 4. Invalid projectId returns 404
test("invalid projectId returns 404", async () => {
  const token = await registerUser("wd404", "wd404@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/sessions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ projectId: "proj_nonexistent" }),
    }),
  )
  expect(res.status).toBe(404)
})
