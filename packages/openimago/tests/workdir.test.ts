import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { workDirRoutes } from "../src/workdir/routes"
import { stat } from "node:fs/promises"
import { signJwt } from "../src/auth/jwt"

let app: Hono

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

beforeAll(async () => {
  await setup()

  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/sessions", workDirRoutes)
  app.route("/api/platform/work-dirs", workDirRoutes)
}, 30000)

afterAll(async () => {
  await teardown()
})

// 1. Creating a session dir generates unique path and forwards to OpenCode
test("creating a session dir generates unique path", async () => {
  const { token } = await registerUser("wdsession", "wdsession@example.com")

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
  expect(body.directory).toMatch(new RegExp(`^${COS_BASE_PATH}/[a-z0-9]+$`))
})

// 2. Creating a session dir with projectId reuses project path
test("creating a session dir with projectId reuses project path", async () => {
  const { token } = await registerUser("wdproj", "wdproj@example.com")

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
  expect([200, 201]).toContain(res.status)
  const body = await res.json() as Record<string, any>
  expect(body.directory).toBe(project.directory)
})

// 3. Creating a session dir creates the directory
test("creating a session dir creates the directory", async () => {
  const { token } = await registerUser("wddir", "wddir@example.com")

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
  const dirStat = await stat(body.directory)
  expect(dirStat.isDirectory()).toBe(true)
})

// 4. Invalid projectId returns 404
test("invalid projectId returns 404", async () => {
  const { token } = await registerUser("wd404", "wd404@example.com")

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

test("stale token with missing user returns 401 before creating work dir", async () => {
  const token = await signJwt({ userId: "usr_missing", role: "user" })

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

  expect(res.status).toBe(401)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("UNAUTHORIZED")
})
