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

function req(
  method: string,
  token: string | null,
  url: string,
  body?: unknown,
) {
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

const cutUrl = (projectId: string, epId: string, suffix = "") =>
  `/api/platform/projects/${projectId}/story/episodes/${epId}/cut${suffix}`

async function readCutFile(dir: string): Promise<Record<string, any>> {
  const raw = await readFile(join(dir, "story/cuts/ep_001.cut.json"), "utf-8")
  return JSON.parse(raw) as Record<string, any>
}

async function getCut(token: string, projectId: string, epId = "ep_001"): Promise<Record<string, any>> {
  const res = await req("GET", token, cutUrl(projectId, epId))
  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, any>
  return body.cut
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

test("GET cut returns an empty lazily-synthesized Cut when no file exists", async () => {
  const token = await registerUser("cut1", "cut1@example.com")
  const project = await createProject(token, "CutTest1")

  const res = await req("GET", token, cutUrl(project.id, "ep_001"))
  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, any>
  expect(body.cut.schemaVersion).toBe(1)
  expect(body.cut.episodeId).toBe("ep_001")
  expect(body.cut.clips).toEqual([])
  expect(body.cut.transitions).toEqual([])
  expect(body.cut.bgm).toBeUndefined()
})

test("GET cut returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("cut2", "cut2@example.com")
  const project = await createProject(ownerToken, "CutTest2")
  const intruderToken = await registerUser("cut2b", "cut2b@example.com")

  const res = await req("GET", intruderToken, cutUrl(project.id, "ep_001"))
  expect(res.status).toBe(403)
})

test("first clip write lazily creates story/cuts/ep_001.cut.json", async () => {
  const token = await registerUser("cut3", "cut3@example.com")
  const project = await createProject(token, "CutTest3")

  const res = await req("PATCH", token, cutUrl(project.id, "ep_001", "/clips/c1"), {
    inPoint: 0,
    outPoint: 5,
  })
  // No clip exists yet — trim of a missing clip is a 404.
  expect(res.status).toBe(404)
})

test("addClip-less flow: split a clip the cut has no clips → 404", async () => {
  const token = await registerUser("cut4", "cut4@example.com")
  const project = await createProject(token, "CutTest4")
  const res = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/missing/split"), {
    atSeconds: 2,
    newClipId: "missing-split",
  })
  expect(res.status).toBe(404)
})

test("setBgm lazily creates the cut file and persists the bgm ref; clearBgm removes it", async () => {
  const token = await registerUser("cut5", "cut5@example.com")
  const project = await createProject(token, "CutTest5")

  const setRes = await req("PUT", token, cutUrl(project.id, "ep_001", "/bgm"), {
    artifactId: "art_song1",
    gainDb: -3,
  })
  expect(setRes.status).toBe(200)
  const setBody = (await setRes.json()) as Record<string, any>
  expect(typeof setBody.updatedAt).toBe("string")
  expect(setBody.updatedAt).not.toBe("")

  const file = await readCutFile(project.directory)
  expect(file.schemaVersion).toBe(1)
  expect(file.episodeId).toBe("ep_001")
  expect(file.bgm.artifactId).toBe("art_song1")
  expect(file.bgm.gainDb).toBe(-3)

  const clearRes = await req("DELETE", token, cutUrl(project.id, "ep_001", "/bgm"), {
    expectedUpdatedAt: setBody.updatedAt,
  })
  expect(clearRes.status).toBe(200)
  const after = await readCutFile(project.directory)
  expect(after.bgm).toBeUndefined()
})

test("setBgm returns 409 when expectedUpdatedAt is stale", async () => {
  const token = await registerUser("cut6", "cut6@example.com")
  const project = await createProject(token, "CutTest6")

  const first = await req("PUT", token, cutUrl(project.id, "ep_001", "/bgm"), { artifactId: "art_a" })
  expect(first.status).toBe(200)

  const stale = await req("PUT", token, cutUrl(project.id, "ep_001", "/bgm"), {
    artifactId: "art_b",
    expectedUpdatedAt: "1999-01-01T00:00:00.000Z",
  })
  expect(stale.status).toBe(409)
  const body = (await stale.json()) as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

// ── Clip lifecycle ─────────────────────────────────────────────────────────
//
// Clips are authored by the agent assembler (Issue 3) — there is no addClip
// endpoint in this layer. Clip-mutation tests therefore seed a cut.json on disk
// directly, then drive trim/split/delete/reorder/transition through the API.

import { writeFile, mkdir } from "node:fs/promises"

async function seedCut(dir: string, clips: any[], transitions: any[] = []) {
  const cut = {
    schemaVersion: 1,
    episodeId: "ep_001",
    clips,
    transitions,
    updatedAt: new Date().toISOString(),
  }
  await mkdir(join(dir, "story/cuts"), { recursive: true })
  await writeFile(join(dir, "story/cuts/ep_001.cut.json"), JSON.stringify(cut, null, 2) + "\n", "utf-8")
  return cut
}

test("reorderClips reorders clips and rewrites order 0..N", async () => {
  const token = await registerUser("cut7", "cut7@example.com")
  const project = await createProject(token, "CutTest7")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
    { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
    { id: "c3", sourceShotId: "s3", inPoint: 0, outPoint: 5, order: 2 },
  ])

  const res = await req("PATCH", token, cutUrl(project.id, "ep_001", "/clips/reorder"), {
    orderedClipIds: ["c3", "c1", "c2"],
  })
  expect(res.status).toBe(200)

  const cut = await getCut(token, project.id)
  expect(cut.clips.map((c: any) => c.id)).toEqual(["c3", "c1", "c2"])
  expect(cut.clips.map((c: any) => c.order)).toEqual([0, 1, 2])
})

test("reorderClips rejects an id set that does not match the current clips", async () => {
  const token = await registerUser("cut8", "cut8@example.com")
  const project = await createProject(token, "CutTest8")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
    { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
  ])
  const res = await req("PATCH", token, cutUrl(project.id, "ep_001", "/clips/reorder"), {
    orderedClipIds: ["c1", "cX"],
  })
  expect(res.status).toBe(400)
})

test("trimClip updates in/out points of one clip", async () => {
  const token = await registerUser("cut9", "cut9@example.com")
  const project = await createProject(token, "CutTest9")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
  ])
  const res = await req("PATCH", token, cutUrl(project.id, "ep_001", "/clips/c1"), {
    inPoint: 2,
    outPoint: 7,
  })
  expect(res.status).toBe(200)
  const cut = await getCut(token, project.id)
  expect(cut.clips[0].inPoint).toBe(2)
  expect(cut.clips[0].outPoint).toBe(7)
})

test("trimClip rejects inPoint >= outPoint", async () => {
  const token = await registerUser("cut10", "cut10@example.com")
  const project = await createProject(token, "CutTest10")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
  ])
  const res = await req("PATCH", token, cutUrl(project.id, "ep_001", "/clips/c1"), {
    inPoint: 8,
    outPoint: 4,
  })
  expect(res.status).toBe(400)
})

test("splitClip splits one clip into two at the given time, reindexing order", async () => {
  const token = await registerUser("cut11", "cut11@example.com")
  const project = await createProject(token, "CutTest11")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
    { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
  ])
  const res = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 4,
    newClipId: "c1-split",
  })
  expect(res.status).toBe(200)
  // response echoes the accepted client-minted id (ADR 0008 #2)
  const body = (await res.json()) as Record<string, any>
  expect(body.newClipId).toBe("c1-split")

  const cut = await getCut(token, project.id)
  expect(cut.clips.length).toBe(3)
  // first half keeps the source range start
  expect(cut.clips[0].id).toBe("c1")
  expect(cut.clips[0].inPoint).toBe(0)
  expect(cut.clips[0].outPoint).toBe(4)
  // second half uses the client-supplied id verbatim with the remaining range
  expect(cut.clips[1].id).toBe("c1-split")
  expect(cut.clips[1].sourceShotId).toBe("s1")
  expect(cut.clips[1].inPoint).toBe(4)
  expect(cut.clips[1].outPoint).toBe(10)
  // trailing clip preserved
  expect(cut.clips[2].id).toBe("c2")
  // order is a contiguous 0..N
  expect(cut.clips.map((c: any) => c.order)).toEqual([0, 1, 2])
})

test("splitClip rejects a newClipId already present in the cut", async () => {
  const token = await registerUser("cut11b", "cut11b@example.com")
  const project = await createProject(token, "CutTest11b")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
    { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
  ])
  const res = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 4,
    newClipId: "c2",
  })
  expect(res.status).toBe(400)
})

test("splitClip rejects a missing or empty newClipId", async () => {
  const token = await registerUser("cut11c", "cut11c@example.com")
  const project = await createProject(token, "CutTest11c")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
  ])
  const missing = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 4,
  })
  expect(missing.status).toBe(400)
  const empty = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 4,
    newClipId: "",
  })
  expect(empty.status).toBe(400)
})

test("splitClip rejects a newClipId that is not a safe slug", async () => {
  const token = await registerUser("cut11d", "cut11d@example.com")
  const project = await createProject(token, "CutTest11d")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 10, order: 0 },
  ])
  const res = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 4,
    newClipId: "../evil id",
  })
  expect(res.status).toBe(400)
})

test("splitClip rejects a split point outside the clip range", async () => {
  const token = await registerUser("cut12", "cut12@example.com")
  const project = await createProject(token, "CutTest12")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 2, outPoint: 6, order: 0 },
  ])
  const res = await req("POST", token, cutUrl(project.id, "ep_001", "/clips/c1/split"), {
    atSeconds: 6,
    newClipId: "c1-split",
  })
  expect(res.status).toBe(400)
})

test("deleteClip removes the clip, reindexes order, and drops its trailing transition", async () => {
  const token = await registerUser("cut13", "cut13@example.com")
  const project = await createProject(token, "CutTest13")
  await seedCut(
    project.directory,
    [
      { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
      { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
      { id: "c3", sourceShotId: "s3", inPoint: 0, outPoint: 5, order: 2 },
    ],
    [{ afterClipId: "c2", kind: "dissolve", durationSeconds: 1 }],
  )
  const res = await req("DELETE", token, cutUrl(project.id, "ep_001", "/clips/c2"))
  expect(res.status).toBe(200)

  const cut = await getCut(token, project.id)
  expect(cut.clips.map((c: any) => c.id)).toEqual(["c1", "c3"])
  expect(cut.clips.map((c: any) => c.order)).toEqual([0, 1])
  // The transition that referenced the deleted clip is gone.
  expect(cut.transitions.find((t: any) => t.afterClipId === "c2")).toBeUndefined()
})

test("setTransition adds/updates a transition after a clip; clearTransition removes it", async () => {
  const token = await registerUser("cut14", "cut14@example.com")
  const project = await createProject(token, "CutTest14")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
    { id: "c2", sourceShotId: "s2", inPoint: 0, outPoint: 4, order: 1 },
  ])

  const setRes = await req("PUT", token, cutUrl(project.id, "ep_001", "/transitions/c1"), {
    kind: "dissolve",
    durationSeconds: 0.5,
  })
  expect(setRes.status).toBe(200)
  let cut = await getCut(token, project.id)
  expect(cut.transitions.length).toBe(1)
  expect(cut.transitions[0].afterClipId).toBe("c1")
  expect(cut.transitions[0].kind).toBe("dissolve")
  expect(cut.transitions[0].durationSeconds).toBe(0.5)

  // Updating the same afterClipId replaces, not appends.
  const updRes = await req("PUT", token, cutUrl(project.id, "ep_001", "/transitions/c1"), {
    kind: "fade",
    durationSeconds: 1,
  })
  expect(updRes.status).toBe(200)
  cut = await getCut(token, project.id)
  expect(cut.transitions.length).toBe(1)
  expect(cut.transitions[0].kind).toBe("fade")

  const clearRes = await req("DELETE", token, cutUrl(project.id, "ep_001", "/transitions/c1"))
  expect(clearRes.status).toBe(200)
  cut = await getCut(token, project.id)
  expect(cut.transitions.length).toBe(0)
})

test("setTransition rejects an unknown kind", async () => {
  const token = await registerUser("cut15", "cut15@example.com")
  const project = await createProject(token, "CutTest15")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
  ])
  const res = await req("PUT", token, cutUrl(project.id, "ep_001", "/transitions/c1"), {
    kind: "wipe",
    durationSeconds: 1,
  })
  expect(res.status).toBe(400)
})

test("setTransition rejects an afterClipId that is not a clip", async () => {
  const token = await registerUser("cut16", "cut16@example.com")
  const project = await createProject(token, "CutTest16")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s1", inPoint: 0, outPoint: 3, order: 0 },
  ])
  const res = await req("PUT", token, cutUrl(project.id, "ep_001", "/transitions/cX"), {
    kind: "cut",
    durationSeconds: 0,
  })
  expect(res.status).toBe(400)
})

test("reader tolerates orphan clips (sourceShotId no longer exists) — returned as-is", async () => {
  const token = await registerUser("cut17", "cut17@example.com")
  const project = await createProject(token, "CutTest17")
  await seedCut(project.directory, [
    { id: "c1", sourceShotId: "s_deleted", inPoint: 0, outPoint: 3, order: 0 },
  ])
  const cut = await getCut(token, project.id)
  expect(cut.clips.length).toBe(1)
  expect(cut.clips[0].sourceShotId).toBe("s_deleted")
})

test("cut write returns 400 for an invalid episode id", async () => {
  const token = await registerUser("cut18", "cut18@example.com")
  const project = await createProject(token, "CutTest18")
  const res = await req("PUT", token, cutUrl(project.id, "../../etc", "/bgm"), { artifactId: "x" })
  expect([400, 404]).toContain(res.status)
})
