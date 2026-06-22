import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyValidateRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  const code = verificationStore.getCode(email)
  if (!code) throw new Error(`No verification code found for ${email}`)
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123", verificationCode: code }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  return body.token as string
}

async function createProject(token: string, name: string): Promise<Record<string, any>> {
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }),
  )
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  return body.project
}

function validateReq(token: string | null, projectId: string) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(`http://localhost/api/platform/projects/${projectId}/story/validate`, {
      method: "GET",
      headers,
    }),
  )
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/projects", storyValidateRoutes)
})

afterAll(async () => {
  await teardown()
})

test("GET /story/validate returns ok:true for a freshly scaffolded project", async () => {
  const token = await registerUser("validateuser", "validate@example.com")
  const project = await createProject(token, "Validate Me")

  const res = await validateReq(token, project.id)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { validation: { ok: boolean; errors: unknown[] } }
  expect(body.validation.ok).toBe(true)
  expect(body.validation.errors).toEqual([])
})

test("GET /story/validate is 403 for a non-owner", async () => {
  const owner = await registerUser("vowner", "vowner@example.com")
  const project = await createProject(owner, "Owned")
  const intruder = await registerUser("vintruder", "vintruder@example.com")

  const res = await validateReq(intruder, project.id)
  expect(res.status).toBe(403)
})

test("GET /story/validate is 404 for an unknown project", async () => {
  const token = await registerUser("vmissing", "vmissing@example.com")
  const res = await validateReq(token, "proj_does_not_exist")
  expect(res.status).toBe(404)
})
