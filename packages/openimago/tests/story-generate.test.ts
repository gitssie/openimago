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

function generateReq(
  token: string | null,
  projectId: string,
  epId: string,
  shotId: string,
  params?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(
      `http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/shots/${shotId}/generate`,
      { method: "POST", headers, body: JSON.stringify(params ?? {}) },
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
  // Mock provider now yields a playable VIDEO so omniclip can hydrate it as a
  // video effect (openimago-1s27 — a PNG cannot become a video effect).
  expect(body.run.params.model).toBe("mock-video-model")
  expect(body.run.result.kind).toBe("video")
  expect(body.run.result.mime).toBe("video/mp4")
  expect(body.run.result.filename).toBe(`${shotId}.mp4`)
  expect(body.run.result.artifactId).toMatch(/^mock_/)
  // Same-origin clip served from packages/web/public (openimago-lwuu): a relative
  // /mock/shot-s0X.mp4 path — NOT an external CDN URL (the old BigBuckBunny URL
  // 403'd here and tripped WebCodecs' cross-origin CORS). Per-shot mocks that
  // actually exist on disk (openimago-0t9m), each with a committed filmstrip.
  // Tests assert the shape only; they never fetch it.
  expect(body.run.result.access.preview).toMatch(/^\/mock\/shot-s0[1-6]\.mp4$/)
  expect(body.run.result.access.thumbnail).toMatch(/^\/mock\/shot-s0[1-6]\.mp4$/)
  expect(body.run.result.access.preview).not.toMatch(/^https?:\/\//)
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

test("generateShot emits a filmstrip + real duration matching the seed fixture shape", async () => {
  const token = await registerUser("gnfs", "gnfs@example.com")
  const project = await createProject(token, "GenFilmstrip")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  const result = body.run.result

  // The generated run must carry the same shape as the seed fixture
  // (docs/story-schema/runs/ep_001.runs.json) so the timeline filmstrip renders
  // continuous distinct frames instead of an empty black strip (openimago-0t9m).

  // 1. Real source duration in seconds (NOT the integer params duration).
  expect(typeof result.duration).toBe("number")
  expect(result.duration).toBeGreaterThan(0)

  // 2. preview points at a per-shot mock that actually exists in public/mock,
  //    NOT the missing /mock-clip.mp4. Filmstrip URL sits beside it.
  expect(result.access.preview).toMatch(/^\/mock\/shot-s0[1-6]\.mp4$/)
  expect(result.access.filmstrip).toMatch(/^\/mock\/shot-s0[1-6]\.filmstrip\.png$/)
  // preview + filmstrip refer to the SAME per-shot asset.
  const previewBase = result.access.preview.replace(/\.mp4$/, "")
  const filmstripBase = result.access.filmstrip.replace(/\.filmstrip\.png$/, "")
  expect(filmstripBase).toBe(previewBase)

  // 3. filmstrip dims object (the contract dims used by the omniclip fork).
  expect(result.filmstrip).toEqual({ frameCount: 24, frameW: 28, frameH: 50 })

  // It is persisted to runs.json too, not just the response.
  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  const persisted = runs.runs[0]
  expect(persisted.result.duration).toBe(result.duration)
  expect(persisted.result.access.filmstrip).toBe(result.access.filmstrip)
  expect(persisted.result.filmstrip).toEqual({ frameCount: 24, frameW: 28, frameH: 50 })
})

test("generateShot maps the same shot deterministically and different shots spread across mocks", async () => {
  const token = await registerUser("gndet", "gndet@example.com")
  const project = await createProject(token, "GenDeterministic")
  const shotA = await addShot(token, project.id, "ep_001")
  const shotB = await addShot(token, project.id, "ep_001")

  const a1 = (await (await generateReq(token, project.id, "ep_001", shotA)).json()) as Record<string, any>
  const a2 = (await (await generateReq(token, project.id, "ep_001", shotA)).json()) as Record<string, any>
  const b1 = (await (await generateReq(token, project.id, "ep_001", shotB)).json()) as Record<string, any>

  // Same shot → same mock clip (deterministic preview + duration).
  expect(a2.run.result.access.preview).toBe(a1.run.result.access.preview)
  expect(a2.run.result.duration).toBe(a1.run.result.duration)

  // Different shots → different mock clips (so the timeline shows distinct
  // footage per clip instead of every clip looking identical — defect #2).
  expect(b1.run.result.access.preview).not.toBe(a1.run.result.access.preview)
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

test("generateShot records posted generation params on the run and persists them on the shot", async () => {
  const token = await registerUser("gnparams", "gnparams@example.com")
  const project = await createProject(token, "GenParams")
  const shotId = await addShot(token, project.id, "ep_001")

  const params = {
    prompt: "a neon alley street race at night",
    model: "seedance-2.0",
    aspectRatio: "9:16",
    durationSeconds: 12,
  }
  const res = await generateReq(token, project.id, "ep_001", shotId, params)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // The run's params reflect the EDITED values (not the shot.description / mock default).
  expect(body.run.params.prompt).toBe(params.prompt)
  expect(body.run.params.model).toBe("seedance-2.0")
  expect(body.run.params.aspectRatio).toBe("9:16")
  expect(body.run.params.durationSeconds).toBe(12)

  // The chosen params are persisted on the shot so the dialog re-opens pre-filled.
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect(shot.status).toBe("generated")
  expect(shot.generationParams).toEqual({
    prompt: params.prompt,
    model: "seedance-2.0",
    aspectRatio: "9:16",
    durationSeconds: 12,
  })
})

test("generateShot records referenceImages on the run and persists them on the shot", async () => {
  const token = await registerUser("gnrefimg", "gnrefimg@example.com")
  const project = await createProject(token, "GenRefImages")
  const shotId = await addShot(token, project.id, "ep_001")

  const params = {
    prompt: "a neon alley street race at night",
    model: "seedance-2.0",
    referenceImages: ["asset_ref_a", "https://cdn.example.com/ref-b.png"],
  }
  const res = await generateReq(token, project.id, "ep_001", shotId, params)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Recorded on the run's params so the provider boundary can condition on them.
  expect(body.run.params.referenceImages).toEqual([
    "asset_ref_a",
    "https://cdn.example.com/ref-b.png",
  ])

  // Persisted on the shot so the dialog re-opens with the reference strip filled.
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect(shot.generationParams.referenceImages).toEqual([
    "asset_ref_a",
    "https://cdn.example.com/ref-b.png",
  ])
})

test("generateShot records generationMode on the run and persists it on the shot", async () => {
  const token = await registerUser("gnmode", "gnmode@example.com")
  const project = await createProject(token, "GenMode")
  const shotId = await addShot(token, project.id, "ep_001")

  const params = {
    prompt: "a lip-synced close-up",
    model: "seedance-2.0",
    generationMode: "对口型数字人",
  }
  const res = await generateReq(token, project.id, "ep_001", shotId, params)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Recorded on the run's params (the generation type the model ran in).
  expect(body.run.params.generationMode).toBe("对口型数字人")

  // Persisted on the shot so the dialog re-opens with the mode selected.
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect(shot.generationParams.generationMode).toBe("对口型数字人")
})

test("generateShot leaves generationMode absent when none is posted", async () => {
  const token = await registerUser("gnnomode", "gnnomode@example.com")
  const project = await createProject(token, "GenNoMode")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId, {
    prompt: "no mode here",
    model: "seedance-2.0",
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  expect(body.run.params.generationMode).toBeUndefined()
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect("generationMode" in (shot.generationParams ?? {})).toBe(false)
})

test("generateShot records resolution on the run and persists it on the shot", async () => {
  const token = await registerUser("gnres", "gnres@example.com")
  const project = await createProject(token, "GenRes")
  const shotId = await addShot(token, project.id, "ep_001")

  const params = { prompt: "a crisp wide shot", model: "seedance-2.0", resolution: "1080p" }
  const res = await generateReq(token, project.id, "ep_001", shotId, params)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  expect(body.run.params.resolution).toBe("1080p")

  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect(shot.generationParams.resolution).toBe("1080p")
})

test("generateShot leaves resolution absent when none is posted", async () => {
  const token = await registerUser("gnnores", "gnnores@example.com")
  const project = await createProject(token, "GenNoRes")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId, {
    prompt: "no resolution here",
    model: "seedance-2.0",
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  expect(body.run.params.resolution).toBeUndefined()
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect("resolution" in (shot.generationParams ?? {})).toBe(false)
})

test("generateShot leaves referenceImages absent when none are posted", async () => {
  const token = await registerUser("gnnorefimg", "gnnorefimg@example.com")
  const project = await createProject(token, "GenNoRefImages")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId, {
    prompt: "no references here",
    model: "seedance-2.0",
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Empty/absent stays optional — no key on the run or the persisted shot params.
  expect(body.run.params.referenceImages).toBeUndefined()
  const ep = await readJson(project.directory, "story/episodes/ep_001.json")
  const shot = ep.shots.find((s: any) => s.id === shotId)
  expect("referenceImages" in (shot.generationParams ?? {})).toBe(false)
})

test("generateShot falls back to shot.description + mock model when no params posted", async () => {
  const token = await registerUser("gnnoparams", "gnnoparams@example.com")
  const project = await createProject(token, "GenNoParams")
  const shotId = await addShot(token, project.id, "ep_001")

  const res = await generateReq(token, project.id, "ep_001", shotId)
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Default model preserved; no aspect/duration keys when none requested.
  expect(body.run.params.model).toBe("mock-video-model")
  expect(body.run.params.aspectRatio).toBeUndefined()
  expect(body.run.params.durationSeconds).toBeUndefined()
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
