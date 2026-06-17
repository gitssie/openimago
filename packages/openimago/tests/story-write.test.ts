import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  const sendRes = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  expect(sendRes.status).toBe(200)
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

function addShotReq(token: string | null, projectId: string, epId: string, expectedUpdatedAt?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(`http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/shots`, {
      method: "POST",
      headers,
      body: JSON.stringify(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    }),
  )
}

async function readEpisode(dir: string): Promise<Record<string, any>> {
  const raw = await readFile(join(dir, "story/episodes/ep_001.json"), "utf-8")
  return JSON.parse(raw) as Record<string, any>
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/projects", storyRoutes)
})

afterAll(async () => {
  await teardown()
})

test("addShot appends a pending shot with incrementing shotNumber and bumps updatedAt", async () => {
  const token = await registerUser("sw1", "sw1@example.com")
  const project = await createProject(token, "WriteTest1")

  const before = await readEpisode(project.directory)
  const beforeCount = before.shots.length
  const beforeMax = before.shots.reduce((m: number, s: any) => Math.max(m, s.shotNumber ?? 0), 0)

  const res = await addShotReq(token, project.id, "ep_001")
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  expect(body.shot.shotNumber).toBe(beforeMax + 1)
  expect(body.shot.status).toBe("pending")
  expect(body.shot.description).toBe("")
  expect(body.shot.dialog).toEqual([])
  expect(body.shot.referenceArtifactIds).toEqual([])
  expect(typeof body.shot.id).toBe("string")
  expect(body.updatedAt).not.toBe(before.updatedAt)

  const after = await readEpisode(project.directory)
  expect(after.shots.length).toBe(beforeCount + 1)
  expect(after.shots.at(-1).id).toBe(body.shot.id)
  expect(after.updatedAt).toBe(body.updatedAt)
})

test("addShot returns 409 when expectedUpdatedAt is stale", async () => {
  const token = await registerUser("sw2", "sw2@example.com")
  const project = await createProject(token, "WriteTest2")

  // Seed one shot so a refused write is observable as an unchanged count.
  const seed = await addShotReq(token, project.id, "ep_001")
  expect(seed.status).toBe(201)
  const countBefore = (await readEpisode(project.directory)).shots.length

  const res = await addShotReq(token, project.id, "ep_001", "1999-01-01T00:00:00.000Z")
  expect(res.status).toBe(409)
  const body = (await res.json()) as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")

  // No write happened — count unchanged.
  const ep = await readEpisode(project.directory)
  expect(ep.shots.length).toBe(countBefore)
})

test("addShot succeeds when expectedUpdatedAt matches current updatedAt", async () => {
  const token = await registerUser("sw3", "sw3@example.com")
  const project = await createProject(token, "WriteTest3")

  const ep = await readEpisode(project.directory)
  const res = await addShotReq(token, project.id, "ep_001", ep.updatedAt)
  expect(res.status).toBe(201)
})

test("addShot returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("sw4", "sw4@example.com")
  const project = await createProject(ownerToken, "WriteTest4")
  const intruderToken = await registerUser("sw4b", "sw4b@example.com")

  const res = await addShotReq(intruderToken, project.id, "ep_001")
  expect(res.status).toBe(403)
})

test("addShot returns 404 when the episode does not exist", async () => {
  const token = await registerUser("sw5", "sw5@example.com")
  const project = await createProject(token, "WriteTest5")

  const res = await addShotReq(token, project.id, "ep_999")
  expect(res.status).toBe(404)
})
