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
  return ((await res.json()) as Record<string, any>).token as string
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
  return ((await res.json()) as Record<string, any>).project
}

async function addShot(token: string, projectId: string, epId: string): Promise<string> {
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/shots`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    }),
  )
  expect(res.status).toBe(201)
  return ((await res.json()) as Record<string, any>).shot.id as string
}

const base = (p: string, e: string) => `http://localhost/api/platform/projects/${p}/story/episodes/${e}/shots`

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" }
  if (token) h.authorization = `Bearer ${token}`
  return h
}

async function readEpisode(dir: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(join(dir, "story/episodes/ep_001.json"), "utf-8")) as Record<string, any>
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

// ── deleteShot ────────────────────────────────────────────────────────────────

test("deleteShot removes the shot and renumbers 1..N", async () => {
  const token = await registerUser("cd1", "cd1@example.com")
  const project = await createProject(token, "CrudDel1")
  const a = await addShot(token, project.id, "ep_001")
  const b = await addShot(token, project.id, "ep_001")
  const c = await addShot(token, project.id, "ep_001")

  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/${b}`, { method: "DELETE", headers: authHeaders(token), body: "{}" }),
  )
  expect(res.status).toBe(200)

  const ep = await readEpisode(project.directory)
  const ids = ep.shots.map((s: any) => s.id)
  expect(ids).toEqual([a, c])
  expect(ep.shots.map((s: any) => s.shotNumber)).toEqual([1, 2])
})

test("deleteShot returns 409 on stale expectedUpdatedAt", async () => {
  const token = await registerUser("cd2", "cd2@example.com")
  const project = await createProject(token, "CrudDel2")
  const a = await addShot(token, project.id, "ep_001")

  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/${a}`, {
      method: "DELETE",
      headers: authHeaders(token),
      body: JSON.stringify({ expectedUpdatedAt: "1999-01-01T00:00:00.000Z" }),
    }),
  )
  expect(res.status).toBe(409)
})

test("deleteShot returns 404 for a missing shot", async () => {
  const token = await registerUser("cd3", "cd3@example.com")
  const project = await createProject(token, "CrudDel3")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/s99-missing`, { method: "DELETE", headers: authHeaders(token), body: "{}" }),
  )
  expect(res.status).toBe(404)
})

test("deleteShot returns 403 for a non-owner", async () => {
  const owner = await registerUser("cd4", "cd4@example.com")
  const project = await createProject(owner, "CrudDel4")
  const a = await addShot(owner, project.id, "ep_001")
  const intruder = await registerUser("cd4b", "cd4b@example.com")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/${a}`, { method: "DELETE", headers: authHeaders(intruder), body: "{}" }),
  )
  expect(res.status).toBe(403)
})

// ── updateShot ────────────────────────────────────────────────────────────────

test("updateShot applies whitelisted patch and ignores other keys", async () => {
  const token = await registerUser("cu1", "cu1@example.com")
  const project = await createProject(token, "CrudUpd1")
  const a = await addShot(token, project.id, "ep_001")

  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/${a}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ description: "a new desc", sceneId: "scene-x", status: "approved", shotNumber: 999 }),
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, any>
  expect(body.shot.description).toBe("a new desc")
  expect(body.shot.sceneId).toBe("scene-x")
  // Non-whitelisted keys ignored.
  expect(body.shot.status).toBe("pending")

  const ep = await readEpisode(project.directory)
  const shot = ep.shots.find((s: any) => s.id === a)
  expect(shot.description).toBe("a new desc")
  expect(shot.shotNumber).toBe(1)
})

test("updateShot returns 409 on stale expectedUpdatedAt", async () => {
  const token = await registerUser("cu2", "cu2@example.com")
  const project = await createProject(token, "CrudUpd2")
  const a = await addShot(token, project.id, "ep_001")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/${a}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ description: "x", expectedUpdatedAt: "1999-01-01T00:00:00.000Z" }),
    }),
  )
  expect(res.status).toBe(409)
})

test("updateShot returns 404 for a missing shot", async () => {
  const token = await registerUser("cu3", "cu3@example.com")
  const project = await createProject(token, "CrudUpd3")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/s99-missing`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ description: "x" }),
    }),
  )
  expect(res.status).toBe(404)
})

// ── reorderShots ────────────────────────────────────────────────────────────────

test("reorderShots reorders and rewrites shotNumber", async () => {
  const token = await registerUser("cr1", "cr1@example.com")
  const project = await createProject(token, "CrudReo1")
  const a = await addShot(token, project.id, "ep_001")
  const b = await addShot(token, project.id, "ep_001")
  const c = await addShot(token, project.id, "ep_001")

  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/reorder`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ orderedShotIds: [c, a, b] }),
    }),
  )
  expect(res.status).toBe(200)

  const ep = await readEpisode(project.directory)
  expect(ep.shots.map((s: any) => s.id)).toEqual([c, a, b])
  expect(ep.shots.map((s: any) => s.shotNumber)).toEqual([1, 2, 3])
})

test("reorderShots returns 400 when the id set does not match", async () => {
  const token = await registerUser("cr2", "cr2@example.com")
  const project = await createProject(token, "CrudReo2")
  const a = await addShot(token, project.id, "ep_001")
  const b = await addShot(token, project.id, "ep_001")

  // Missing one id.
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/reorder`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ orderedShotIds: [a] }),
    }),
  )
  expect(res.status).toBe(400)

  // Unchanged on disk.
  const ep = await readEpisode(project.directory)
  expect(ep.shots.map((s: any) => s.id)).toEqual([a, b])
})

test("reorderShots returns 409 on stale expectedUpdatedAt", async () => {
  const token = await registerUser("cr3", "cr3@example.com")
  const project = await createProject(token, "CrudReo3")
  const a = await addShot(token, project.id, "ep_001")
  const b = await addShot(token, project.id, "ep_001")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/reorder`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ orderedShotIds: [b, a], expectedUpdatedAt: "1999-01-01T00:00:00.000Z" }),
    }),
  )
  expect(res.status).toBe(409)
})

test("reorder route is not swallowed by :shotId DELETE/PATCH", async () => {
  // Sanity: PATCH /shots/reorder must hit the reorder handler, not be parsed
  // as :shotId === "reorder".
  const token = await registerUser("cr4", "cr4@example.com")
  const project = await createProject(token, "CrudReo4")
  const a = await addShot(token, project.id, "ep_001")
  const res = await app.fetch(
    new Request(`${base(project.id, "ep_001")}/reorder`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ orderedShotIds: [a] }),
    }),
  )
  // Single shot, set matches → 200 (would be 404 if treated as shotId "reorder").
  expect(res.status).toBe(200)
})
