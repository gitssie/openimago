import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile, writeFile, rm } from "node:fs/promises"
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

function generateReq(token: string | null, projectId: string, epId: string, shotId: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(
      `http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/shots/${shotId}/generate`,
      { method: "POST", headers, body: "{}" },
    ),
  )
}

async function readJson(dir: string, rel: string): Promise<Record<string, any>> {
  return JSON.parse(await readFile(join(dir, rel), "utf-8")) as Record<string, any>
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

test("generateShot appends a completed run with result and marks shot generated", async () => {
  const token = await registerUser("gn1", "gn1@example.com")
  const project = await createProject(token, "GenTest1")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Returned run
  expect(body.run.status).toBe("completed")
  expect(body.run.shotId).toBe(shotId)
  expect(body.run.params.model).toBe("mock-image-model")
  expect(body.run.result.kind).toBe("image")
  expect(body.run.result.mime).toBe("image/png")
  expect(body.run.result.artifactId).toMatch(/^mock_/)
  expect(body.run.result.access.thumbnail).toContain("picsum.photos")
  expect(body.run.result.access.preview).toContain("picsum.photos")
  expect(body.run.id).toMatch(/^run_/)

  // runs.json now has the run
  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.runs.length).toBe(1)
  expect(runs.runs[0].id).toBe(body.run.id)
  expect(runs.runs[0].status).toBe("completed")
  expect(runs.runs[0].shotId).toBe(shotId)

  // episode shot status flipped to generated + updatedAt bumped
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect(shot.status).toBe("generated")
})

test("generateShot initializes runs.json when it does not exist", async () => {
  const token = await registerUser("gn2", "gn2@example.com")
  const project = await createProject(token, "GenTest2")
  const shotId = await addShot(token, project.id, "ep_001")

  // Remove the scaffolded runs file to exercise the init path.
  await rm(join(project.directory, "story/runs/ep_001.runs.json"))

  const res = await generateReq(token, project.id, "ep_001", shotId)
  expect(res.status).toBe(201)

  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.schemaVersion).toBe(1)
  expect(runs.episodeId).toBe("ep_001")
  expect(runs.runs.length).toBe(1)
})

test("generateShot appends (does not overwrite) existing runs", async () => {
  const token = await registerUser("gn3", "gn3@example.com")
  const project = await createProject(token, "GenTest3")
  const shotId = await addShot(token, project.id, "ep_001")

  // Pre-seed runs.json with one existing run.
  const runsPath = join(project.directory, "story/runs/ep_001.runs.json")
  await writeFile(
    runsPath,
    JSON.stringify({ schemaVersion: 1, episodeId: "ep_001", runs: [{ id: "run_existing", status: "completed" }] }),
    "utf-8",
  )

  const res = await generateReq(token, project.id, "ep_001", shotId)
  expect(res.status).toBe(201)

  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.runs.length).toBe(2)
  expect(runs.runs[0].id).toBe("run_existing")
})

test("generateShot returns 404 when the shot does not exist", async () => {
  const token = await registerUser("gn4", "gn4@example.com")
  const project = await createProject(token, "GenTest4")

  const res = await generateReq(token, project.id, "ep_001", "s99-missing")
  expect(res.status).toBe(404)
})

test("generateShot returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("gn5", "gn5@example.com")
  const project = await createProject(ownerToken, "GenTest5")
  const shotId = await addShot(ownerToken, project.id, "ep_001")
  const intruderToken = await registerUser("gn5b", "gn5b@example.com")

  const res = await generateReq(intruderToken, project.id, "ep_001", shotId)
  expect(res.status).toBe(403)
})
