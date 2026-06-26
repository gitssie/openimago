import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile, writeFile, mkdir } from "node:fs/promises"
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

function req(method: string, token: string | null, url: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(`http://localhost${url}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  )
}

const assembleUrl = (projectId: string, epId: string) =>
  `/api/platform/projects/${projectId}/story/episodes/${epId}/cut/assemble`

const cutUrl = (projectId: string, epId: string) =>
  `/api/platform/projects/${projectId}/story/episodes/${epId}/cut`

/** Overwrite the episode file with the given shots (preserving the rest). */
async function writeShots(dir: string, shots: any[]): Promise<void> {
  const epPath = join(dir, "story/episodes/ep_001.json")
  const ep = JSON.parse(await readFile(epPath, "utf-8")) as Record<string, any>
  ep.shots = shots
  ep.updatedAt = new Date().toISOString()
  await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf-8")
}

/** Write a runs file with the given runs. */
async function writeRuns(dir: string, runs: any[]): Promise<void> {
  const runsPath = join(dir, "story/runs/ep_001.runs.json")
  const doc = { schemaVersion: 1, episodeId: "ep_001", runs }
  await mkdir(join(dir, "story/runs"), { recursive: true })
  await writeFile(runsPath, JSON.stringify(doc, null, 2) + "\n", "utf-8")
}

function completedRun(shotId: string, kind: "image" | "video", duration?: number): any {
  return {
    id: `run_${shotId}`,
    nodeId: "",
    shotId,
    status: "completed",
    params: { prompt: "x", model: "m", ...(duration !== undefined ? { duration } : {}) },
    result: {
      artifactId: `art_${shotId}`,
      kind,
      mime: kind === "video" ? "video/mp4" : "image/png",
      filename: `${shotId}.${kind === "video" ? "mp4" : "png"}`,
      ...(duration !== undefined ? { duration } : {}),
      access: { preview: "u", thumbnail: "u" },
    },
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }
}

async function getCut(token: string, projectId: string): Promise<Record<string, any>> {
  const res = await req("GET", token, cutUrl(projectId, "ep_001"))
  expect(res.status).toBe(200)
  return ((await res.json()) as Record<string, any>).cut
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

test("assemble builds one clip per shot with completed media, ordered by shotNumber", async () => {
  const token = await registerUser("asm1", "asm1@example.com")
  const project = await createProject(token, "Asm1")

  await writeShots(project.directory, [
    { id: "s2", shotNumber: 2, status: "generated", durationEstimate: 4 },
    { id: "s1", shotNumber: 1, status: "generated", durationEstimate: 3 },
  ])
  await writeRuns(project.directory, [completedRun("s1", "image"), completedRun("s2", "video", 4)])

  const res = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, any>
  expect(typeof body.updatedAt).toBe("string")
  expect(body.cut.clips.length).toBe(2)

  const cut = await getCut(token, project.id)
  // Ordered by shotNumber: s1 then s2.
  expect(cut.clips.map((c: any) => c.sourceShotId)).toEqual(["s1", "s2"])
  expect(cut.clips.map((c: any) => c.order)).toEqual([0, 1])
  expect(cut.clips.every((c: any) => c.inPointMs === 0)).toBe(true)
  expect(cut.transitions).toEqual([])
  expect(cut.bgm).toBeUndefined()
})

test("assemble skips shots that have no completed video/image run", async () => {
  const token = await registerUser("asm2", "asm2@example.com")
  const project = await createProject(token, "Asm2")

  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, status: "generated", durationEstimate: 3 },
    { id: "s2", shotNumber: 2, status: "pending", durationEstimate: 3 },
    { id: "s3", shotNumber: 3, status: "generated", durationEstimate: 3 },
  ])
  await writeRuns(project.directory, [
    completedRun("s1", "image"),
    // s2: no run at all
    { ...completedRun("s3", "video", 5), status: "failed" }, // s3 not completed
  ])

  const res = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const cut = await getCut(token, project.id)
  expect(cut.clips.map((c: any) => c.sourceShotId)).toEqual(["s1"])
})

test("assemble skips audio-only runs (only video/image count as visual media)", async () => {
  const token = await registerUser("asm3", "asm3@example.com")
  const project = await createProject(token, "Asm3")

  await writeShots(project.directory, [{ id: "s1", shotNumber: 1, status: "generated" }])
  await writeRuns(project.directory, [completedRun("s1", "audio" as any)])

  const res = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const cut = await getCut(token, project.id)
  expect(cut.clips.length).toBe(0)
})

test("assemble derives outPoint from run duration, then shot durationEstimate, then a default", async () => {
  const token = await registerUser("asm4", "asm4@example.com")
  const project = await createProject(token, "Asm4")

  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, status: "generated", durationEstimate: 7 }, // no run duration → shot estimate 7
    { id: "s2", shotNumber: 2, status: "generated", durationEstimate: 7 }, // run duration 5 wins
    { id: "s3", shotNumber: 3, status: "generated" }, // no duration anywhere → default
  ])
  await writeRuns(project.directory, [
    completedRun("s1", "image"), // no duration
    completedRun("s2", "video", 5),
    completedRun("s3", "image"), // no duration
  ])

  const res = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const cut = await getCut(token, project.id)
  const byShot = Object.fromEntries(cut.clips.map((c: any) => [c.sourceShotId, c]))
  // outPointMs is integer ms: shot estimate 7s → 7000ms, run duration 5s → 5000ms.
  expect(byShot.s1.outPointMs).toBe(7000)
  expect(byShot.s2.outPointMs).toBe(5000)
  expect(byShot.s3.outPointMs).toBeGreaterThan(0) // default fallback (DEFAULT_ASSEMBLED_CLIP_MS)
})

test("assemble is idempotent-shaped: re-running replaces clips and bumps updatedAt", async () => {
  const token = await registerUser("asm5", "asm5@example.com")
  const project = await createProject(token, "Asm5")

  await writeShots(project.directory, [{ id: "s1", shotNumber: 1, status: "generated", durationEstimate: 3 }])
  await writeRuns(project.directory, [completedRun("s1", "image")])

  const first = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(first.status).toBe(200)
  const firstUpdatedAt = ((await first.json()) as Record<string, any>).updatedAt as string
  const firstClipId = (await getCut(token, project.id)).clips[0].id as string

  // Add a second shot with media, re-assemble.
  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, status: "generated", durationEstimate: 3 },
    { id: "s2", shotNumber: 2, status: "generated", durationEstimate: 3 },
  ])
  await writeRuns(project.directory, [completedRun("s1", "image"), completedRun("s2", "image")])

  const second = await req("POST", token, assembleUrl(project.id, "ep_001"), {
    expectedUpdatedAt: firstUpdatedAt,
  })
  expect(second.status).toBe(200)
  const cut = await getCut(token, project.id)
  expect(cut.clips.length).toBe(2)
  // Clip ids are stable per source shot, so s1's clip id is unchanged.
  expect(cut.clips.find((c: any) => c.sourceShotId === "s1").id).toBe(firstClipId)
})

test("assemble returns 409 when expectedUpdatedAt is stale", async () => {
  const token = await registerUser("asm6", "asm6@example.com")
  const project = await createProject(token, "Asm6")

  await writeShots(project.directory, [{ id: "s1", shotNumber: 1, status: "generated", durationEstimate: 3 }])
  await writeRuns(project.directory, [completedRun("s1", "image")])

  const first = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(first.status).toBe(200)

  const stale = await req("POST", token, assembleUrl(project.id, "ep_001"), {
    expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
  })
  expect(stale.status).toBe(409)
  expect(((await stale.json()) as Record<string, any>).error.code).toBe("CONFLICT")
})

test("assemble returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("asm7", "asm7@example.com")
  const project = await createProject(ownerToken, "Asm7")
  const intruderToken = await registerUser("asm7b", "asm7b@example.com")

  const res = await req("POST", intruderToken, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(403)
})

test("assemble returns 404 when the episode does not exist", async () => {
  const token = await registerUser("asm8", "asm8@example.com")
  const project = await createProject(token, "Asm8")

  const res = await req("POST", token, assembleUrl(project.id, "ep_999"))
  expect(res.status).toBe(404)
})

test("assemble on an episode with no media writes an empty clip list", async () => {
  const token = await registerUser("asm9", "asm9@example.com")
  const project = await createProject(token, "Asm9")
  // Default scaffolded episode has zero shots.
  const res = await req("POST", token, assembleUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const cut = await getCut(token, project.id)
  expect(cut.clips).toEqual([])
})
