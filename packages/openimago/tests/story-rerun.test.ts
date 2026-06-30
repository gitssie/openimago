import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// ── Artifact-panel rerun (ADR 0003, openimago-wc96) ───────────────────────────
//
// rerunArtifact re-executes a prior GenerationRun (located by its
// result.artifactId in the episode's runs.json) with its persisted params,
// appending a NEW run — never mutating the prior run or the shot. Distinct from
// shot 重新生成 (.../shots/:id/generate), which flips shot status + persists params.

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

/** Generate a shot (creates the prior run we rerun from) and return its run. */
async function generate(
  token: string,
  projectId: string,
  epId: string,
  shotId: string,
  params?: Record<string, unknown>,
): Promise<Record<string, any>> {
  const res = await app.fetch(
    new Request(
      `http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/shots/${shotId}/generate`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(params ?? {}),
      },
    ),
  )
  expect(res.status).toBe(201)
  return ((await res.json()) as Record<string, any>).run
}

function rerunReq(
  token: string | null,
  projectId: string,
  epId: string,
  body: Record<string, unknown>,
) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(`http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/runs/rerun`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
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

test("rerunArtifact appends a NEW run carrying the prior run's params", async () => {
  const token = await registerUser("rr1", "rr1@example.com")
  const project = await createProject(token, "Rerun1")
  const shotId = await addShot(token, project.id, "ep_001")

  const prior = await generate(token, project.id, "ep_001", shotId, {
    prompt: "a neon alley street race at night",
    model: "seedance-2.0",
    aspectRatio: "9:16",
    durationSeconds: 12,
  })
  const artifactId = prior.result.artifactId as string

  const res = await rerunReq(token, project.id, "ep_001", { artifactId })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // A NEW run (distinct ids), reusing the prior run's persisted params.
  expect(body.run.id).not.toBe(prior.id)
  expect(body.run.id).toMatch(/^run_/)
  expect(body.run.status).toBe("completed")
  expect(body.run.shotId).toBe(shotId)
  expect(body.run.params.prompt).toBe("a neon alley street race at night")
  expect(body.run.params.model).toBe("seedance-2.0")
  expect(body.run.params.aspectRatio).toBe("9:16")
  expect(body.run.params.durationSeconds).toBe(12)

  // A NEW artifact, immutably linked back to the source artifact.
  expect(body.run.result.artifactId).toMatch(/^mock_/)
  expect(body.run.result.artifactId).not.toBe(artifactId)
  expect(body.run.parentArtifactId).toBe(artifactId)

  // Appended (not overwritten): runs.json now holds both runs.
  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.runs.length).toBe(2)
  expect(runs.runs[0].id).toBe(prior.id)
  expect(runs.runs[1].id).toBe(body.run.id)
})

test("rerunArtifact does NOT mutate the prior run or the shot", async () => {
  const token = await registerUser("rr2", "rr2@example.com")
  const project = await createProject(token, "Rerun2")
  const shotId = await addShot(token, project.id, "ep_001")

  const prior = await generate(token, project.id, "ep_001", shotId, { prompt: "first take" })
  const artifactId = prior.result.artifactId as string

  const epBefore = await readJson(project.directory, "story/episodes/ep_001.json")
  const shotBefore = epBefore.shots.find((s: any) => s.id === shotId)

  await rerunReq(token, project.id, "ep_001", { artifactId })

  // The source run is untouched.
  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  const persistedPrior = runs.runs.find((r: any) => r.id === prior.id)
  expect(persistedPrior.result.artifactId).toBe(artifactId)
  expect(persistedPrior.params.prompt).toBe("first take")

  // The shot is untouched (rerun never re-flips status or re-writes generationParams).
  const epAfter = await readJson(project.directory, "story/episodes/ep_001.json")
  const shotAfter = epAfter.shots.find((s: any) => s.id === shotId)
  expect(shotAfter.generationParams).toEqual(shotBefore.generationParams)
})

test("rerunArtifact applies per-field overrides over the prior params", async () => {
  const token = await registerUser("rr3", "rr3@example.com")
  const project = await createProject(token, "Rerun3")
  const shotId = await addShot(token, project.id, "ep_001")

  const prior = await generate(token, project.id, "ep_001", shotId, {
    prompt: "original prompt",
    model: "seedance-2.0",
    aspectRatio: "9:16",
    durationSeconds: 8,
  })
  const artifactId = prior.result.artifactId as string

  const res = await rerunReq(token, project.id, "ep_001", { artifactId, prompt: "edited prompt" })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // The edited field wins; un-edited fields inherit from the prior run.
  expect(body.run.params.prompt).toBe("edited prompt")
  expect(body.run.params.model).toBe("seedance-2.0")
  expect(body.run.params.aspectRatio).toBe("9:16")
  expect(body.run.params.durationSeconds).toBe(8)
})

test("rerunArtifact returns 404 when no run matches the artifactId", async () => {
  const token = await registerUser("rr4", "rr4@example.com")
  const project = await createProject(token, "Rerun4")
  const shotId = await addShot(token, project.id, "ep_001")
  // At least one run exists so the runs file is present — the 404 is about the
  // missing artifact, not a missing runs.json.
  await generate(token, project.id, "ep_001", shotId)

  const res = await rerunReq(token, project.id, "ep_001", { artifactId: "mock_does_not_exist" })
  expect(res.status).toBe(404)
})

test("rerunArtifact returns 400 when artifactId is missing", async () => {
  const token = await registerUser("rr5", "rr5@example.com")
  const project = await createProject(token, "Rerun5")

  const res = await rerunReq(token, project.id, "ep_001", {})
  expect(res.status).toBe(400)
})

test("rerunArtifact returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("rr6", "rr6@example.com")
  const project = await createProject(ownerToken, "Rerun6")
  const shotId = await addShot(ownerToken, project.id, "ep_001")
  const prior = await generate(ownerToken, project.id, "ep_001", shotId)
  const intruderToken = await registerUser("rr6b", "rr6b@example.com")

  const res = await rerunReq(intruderToken, project.id, "ep_001", {
    artifactId: prior.result.artifactId,
  })
  expect(res.status).toBe(403)
})
