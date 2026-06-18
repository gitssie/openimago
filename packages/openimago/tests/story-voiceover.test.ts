import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile, writeFile } from "node:fs/promises"
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

const voUrlEpisode = (projectId: string, epId: string) =>
  `/api/platform/projects/${projectId}/story/episodes/${epId}/voiceover`
const voUrlShot = (projectId: string, epId: string, shotId: string) =>
  `/api/platform/projects/${projectId}/story/episodes/${epId}/shots/${shotId}/voiceover`

async function writeShots(dir: string, shots: any[]): Promise<void> {
  const epPath = join(dir, "story/episodes/ep_001.json")
  const ep = JSON.parse(await readFile(epPath, "utf-8")) as Record<string, any>
  ep.shots = shots
  ep.updatedAt = new Date().toISOString()
  await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf-8")
}

async function writeBibleCharacters(dir: string, characters: any[]): Promise<void> {
  const biblePath = join(dir, "story/bible.json")
  const bible = JSON.parse(await readFile(biblePath, "utf-8")) as Record<string, any>
  bible.characters = characters
  await writeFile(biblePath, JSON.stringify(bible, null, 2) + "\n", "utf-8")
}

async function readRuns(dir: string): Promise<any[]> {
  const runsPath = join(dir, "story/runs/ep_001.runs.json")
  const doc = JSON.parse(await readFile(runsPath, "utf-8")) as Record<string, any>
  return doc.runs as any[]
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

test("voiceover for a shot appends one audio Run per dialog line, shotId set", async () => {
  const token = await registerUser("vo1", "vo1@example.com")
  const project = await createProject(token, "Vo1")
  await writeShots(project.directory, [
    {
      id: "s1",
      shotNumber: 1,
      status: "generated",
      dialog: [
        { characterId: "kai", text: "We have to move." },
        { characterId: "mara", text: "Not yet." },
      ],
    },
  ])

  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  expect(body.runs.length).toBe(2)
  expect(body.runs.every((r: any) => r.shotId === "s1")).toBe(true)
  expect(body.runs.every((r: any) => r.status === "completed")).toBe(true)
  expect(body.runs.every((r: any) => r.result.kind === "audio")).toBe(true)
  expect(body.runs.every((r: any) => r.result.mime.startsWith("audio/"))).toBe(true)

  const runs = await readRuns(project.directory)
  const audioRuns = runs.filter((r: any) => r.result?.kind === "audio")
  expect(audioRuns.length).toBe(2)
})

test("voiceover resolves voiceId from the bible character, default when unset", async () => {
  const token = await registerUser("vo2", "vo2@example.com")
  const project = await createProject(token, "Vo2")
  await writeBibleCharacters(project.directory, [
    { id: "kai", displayName: "Kai", voiceId: "voice_kai" },
    // "mara" has no voiceId → default
    { id: "mara", displayName: "Mara" },
  ])
  await writeShots(project.directory, [
    {
      id: "s1",
      shotNumber: 1,
      dialog: [
        { characterId: "kai", text: "Line one." },
        { characterId: "mara", text: "Line two." },
        { characterId: "ghost", text: "Unknown speaker." }, // not in bible → default
      ],
    },
  ])

  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  const byChar = Object.fromEntries(body.runs.map((r: any) => [r.params.characterId, r]))
  expect(byChar.kai.params.voiceId).toBe("voice_kai")
  expect(typeof byChar.mara.params.voiceId).toBe("string")
  expect(byChar.mara.params.voiceId).not.toBe("voice_kai")
  expect(byChar.ghost.params.voiceId).toBe(byChar.mara.params.voiceId) // both default
})

test("voiceover maps dialog emotion to a TTS style param when present", async () => {
  const token = await registerUser("vo3", "vo3@example.com")
  const project = await createProject(token, "Vo3")
  await writeShots(project.directory, [
    {
      id: "s1",
      shotNumber: 1,
      dialog: [
        { characterId: "kai", text: "Calm line." },
        { characterId: "kai", text: "Angry line!", emotion: "angry" },
      ],
    },
  ])
  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  const withEmotion = body.runs.find((r: any) => r.params.style === "angry")
  expect(withEmotion).toBeDefined()
  // Lines without emotion omit the style param.
  const withoutEmotion = body.runs.find((r: any) => r.params.text === "Calm line.")
  expect(withoutEmotion.params.style).toBeUndefined()
})

test("voiceover skips dialog lines with empty text", async () => {
  const token = await registerUser("vo4", "vo4@example.com")
  const project = await createProject(token, "Vo4")
  await writeShots(project.directory, [
    {
      id: "s1",
      shotNumber: 1,
      dialog: [
        { characterId: "kai", text: "Real line." },
        { characterId: "kai", text: "   " },
        { characterId: "kai", text: "" },
      ],
    },
  ])
  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  expect(body.runs.length).toBe(1)
})

test("episode-level voiceover generates runs for every shot's dialog", async () => {
  const token = await registerUser("vo5", "vo5@example.com")
  const project = await createProject(token, "Vo5")
  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, dialog: [{ characterId: "kai", text: "A." }] },
    { id: "s2", shotNumber: 2, dialog: [{ characterId: "mara", text: "B." }, { characterId: "kai", text: "C." }] },
    { id: "s3", shotNumber: 3, dialog: [] },
  ])
  const res = await req("POST", token, voUrlEpisode(project.id, "ep_001"))
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  expect(body.runs.length).toBe(3)
  const shotIds = body.runs.map((r: any) => r.shotId).sort()
  expect(shotIds).toEqual(["s1", "s2", "s2"])
})

test("voiceover does NOT write to cut.json (VO is derived)", async () => {
  const token = await registerUser("vo6", "vo6@example.com")
  const project = await createProject(token, "Vo6")
  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, dialog: [{ characterId: "kai", text: "Hi." }] },
  ])
  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)

  // The cut endpoint still returns an empty, never-written cut.
  const cutRes = await req("GET", token, `/api/platform/projects/${project.id}/story/episodes/ep_001/cut`)
  expect(cutRes.status).toBe(200)
  const cut = ((await cutRes.json()) as Record<string, any>).cut
  expect(cut.updatedAt).toBe("")
  expect(cut.clips).toEqual([])
})

test("voiceover appends (does not clobber) existing runs", async () => {
  const token = await registerUser("vo7", "vo7@example.com")
  const project = await createProject(token, "Vo7")
  await writeShots(project.directory, [
    { id: "s1", shotNumber: 1, dialog: [{ characterId: "kai", text: "Hi." }] },
  ])
  // Pre-seed an image run via the generate endpoint.
  const gen = await req("POST", token, `/api/platform/projects/${project.id}/story/episodes/ep_001/shots/s1/generate`)
  expect(gen.status).toBe(201)
  const before = (await readRuns(project.directory)).length

  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s1"))
  expect(res.status).toBe(201)
  const after = await readRuns(project.directory)
  expect(after.length).toBe(before + 1)
})

test("voiceover returns 404 for a missing shot", async () => {
  const token = await registerUser("vo8", "vo8@example.com")
  const project = await createProject(token, "Vo8")
  const res = await req("POST", token, voUrlShot(project.id, "ep_001", "s_missing"))
  expect(res.status).toBe(404)
})

test("voiceover returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("vo9", "vo9@example.com")
  const project = await createProject(ownerToken, "Vo9")
  const intruderToken = await registerUser("vo9b", "vo9b@example.com")
  const res = await req("POST", intruderToken, voUrlEpisode(project.id, "ep_001"))
  expect(res.status).toBe(403)
})

test("voiceover returns 404 when the episode does not exist", async () => {
  const token = await registerUser("vo10", "vo10@example.com")
  const project = await createProject(token, "Vo10")
  const res = await req("POST", token, voUrlEpisode(project.id, "ep_999"))
  expect(res.status).toBe(404)
})
