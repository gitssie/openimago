import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

// ── Bible-element concept art (ADR 0004, openimago-ugy9) ──────────────────────
//
// "评论生成" on a 关键元素 (Character/Scene) card generates concept art via a Run with
// shotId:null (CONTEXT.md Run — Bible concept art is shot-less, linked to a
// Workflow node). The run's nodeId carries the element id so the left-panel
// element card surfaces its thumbnail (mapper.runNodeMatchesElement). Reuses the
// shared media-gen path (appendRun) — image-kind for a character/scene.

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

/** Write a single Bible element so the concept endpoint has a real target. */
async function seedBibleElement(
  dir: string,
  section: "characters" | "scenes",
  element: Record<string, unknown>,
): Promise<void> {
  const biblePath = join(dir, "story/bible.json")
  const bible = JSON.parse(await readFile(biblePath, "utf-8")) as Record<string, any>
  bible[section] = [element]
  await writeFile(biblePath, JSON.stringify(bible, null, 2) + "\n", "utf-8")
}

function conceptReq(
  token: string | null,
  projectId: string,
  epId: string,
  elementId: string,
  body?: Record<string, unknown>,
) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(
      `http://localhost/api/platform/projects/${projectId}/story/episodes/${epId}/elements/${elementId}/concept`,
      { method: "POST", headers, body: JSON.stringify(body ?? {}) },
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

test("element concept appends a shotId:null image run linked to the element", async () => {
  const token = await registerUser("ec1", "ec1@example.com")
  const project = await createProject(token, "Concept1")
  await seedBibleElement(project.directory, "characters", {
    id: "char_kai",
    name: "Kai",
    description: "young street racer with a cybernetic arm",
  })

  const res = await conceptReq(token, project.id, "ep_001", "char_kai")
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>

  // Bible concept art is shot-less and image-kind (CONTEXT.md Run).
  expect(body.run.id).toMatch(/^run_/)
  expect(body.run.status).toBe("completed")
  expect(body.run.shotId).toBeNull()
  expect(body.run.result.kind).toBe("image")
  expect(body.run.result.artifactId).toMatch(/^mock_/)
  expect(body.run.result.access.thumbnail).toBeTruthy()

  // nodeId carries the element id so the element card can resolve this thumbnail
  // (left-panel mapper matches nodeId ⊇ element-id token).
  expect(body.run.nodeId).toContain("char_kai")

  // Prompt derives from the element's description when none is posted.
  expect(body.run.params.prompt).toContain("young street racer")

  // Appended to runs.json (append-only).
  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.runs.length).toBe(1)
  expect(runs.runs[0].id).toBe(body.run.id)
  expect(runs.runs[0].shotId).toBeNull()
  expect(runs.runs[0].result.kind).toBe("image")
})

test("element concept works for a scene element too, and appends (does not overwrite)", async () => {
  const token = await registerUser("ec2", "ec2@example.com")
  const project = await createProject(token, "Concept2")
  await seedBibleElement(project.directory, "scenes", {
    id: "scene_neon_alley",
    name: "Neon Alley",
    description: "rain-slicked cyberpunk back alley",
  })

  const first = await conceptReq(token, project.id, "ep_001", "scene_neon_alley")
  expect(first.status).toBe(201)
  const second = await conceptReq(token, project.id, "ep_001", "scene_neon_alley")
  expect(second.status).toBe(201)

  const runs = await readJson(project.directory, "story/runs/ep_001.runs.json")
  expect(runs.runs.length).toBe(2)
  expect(runs.runs.every((r: any) => r.shotId === null && r.result.kind === "image")).toBe(true)
})

test("element concept records a posted prompt + model override on the run", async () => {
  const token = await registerUser("ec3", "ec3@example.com")
  const project = await createProject(token, "Concept3")
  await seedBibleElement(project.directory, "characters", {
    id: "char_rei",
    name: "Rei",
    description: "genius mechanic",
  })

  const res = await conceptReq(token, project.id, "ep_001", "char_rei", {
    prompt: "full body turnaround, neon rim light",
    model: "flux-pro",
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as Record<string, any>
  expect(body.run.params.prompt).toBe("full body turnaround, neon rim light")
  expect(body.run.params.model).toBe("flux-pro")
})

test("element concept returns 404 when the element is not in the bible", async () => {
  const token = await registerUser("ec4", "ec4@example.com")
  const project = await createProject(token, "Concept4")

  const res = await conceptReq(token, project.id, "ep_001", "char_missing")
  expect(res.status).toBe(404)
})

test("element concept returns 403 for a non-owner", async () => {
  const ownerToken = await registerUser("ec5", "ec5@example.com")
  const project = await createProject(ownerToken, "Concept5")
  await seedBibleElement(project.directory, "characters", { id: "char_kai", name: "Kai", description: "racer" })
  const intruderToken = await registerUser("ec5b", "ec5b@example.com")

  const res = await conceptReq(intruderToken, project.id, "ep_001", "char_kai")
  expect(res.status).toBe(403)
})
