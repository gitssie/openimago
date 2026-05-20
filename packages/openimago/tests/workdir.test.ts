import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown, COS_BASE_PATH } from "./helper"
import type { Session } from "@opencode-ai/sdk/v2"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { workDirRoutes } from "../src/workdir/routes"
import { stat } from "node:fs/promises"

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

function isSession(obj: unknown): obj is Session {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    typeof (obj as Session).id === "string" &&
    (obj as Session).id.startsWith("ses_") &&
    "title" in obj &&
    "directory" in obj &&
    "projectID" in obj &&
    "slug" in obj &&
    "version" in obj &&
    "time" in obj &&
    typeof (obj as Session).time === "object" &&
    "created" in (obj as Session).time &&
    "updated" in (obj as Session).time
  )
}

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
  expect(body.workDir.id).toMatch(/^dir_/)
  expect(body.workDir.fullPath).toBe(`${COS_BASE_PATH}/${body.workDir.id}`)
  expect(body.workDir.type).toBe("session")
  expect(body.workDir.projectId).toBeNull()

  // Session should be a valid OpenCode Session object
  expect(body.session).toBeDefined()
  expect(isSession(body.session)).toBe(true)
  // session.directory reflects workspace directory, not workdir path
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
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.workDir.projectId).toBe(project.id)
  expect(body.workDir.fullPath).toBe(project.fullPath)
  expect(body.session).toBeDefined()
  expect(isSession(body.session)).toBe(true)
  // session.directory reflects workspace directory, not workdir path
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
  const dirStat = await stat(body.workDir.fullPath)
  expect(dirStat.isDirectory()).toBe(true)
  expect(body.session).toBeDefined()
  expect(isSession(body.session)).toBe(true)
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
