import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { verificationStore } from "../src/auth/email-verification"
import { stat } from "node:fs/promises"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  // Step 1: Request verification code
  const sendRes = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  expect(sendRes.status).toBe(200)

  // Step 2: Retrieve the code from the in-memory store (dev mode)
  const code = verificationStore.getCode(email)
  if (!code) throw new Error(`No verification code found for ${email}`)

  // Step 3: Register with the verification code
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123", verificationCode: code }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.token as string
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
})

afterAll(async () => {
  await teardown()
})

// 1. User can create a project
test("user can create a project", async () => {
  const token = await registerUser("dev1", "dev1@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "My Project", description: "A test project" }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.project.name).toBe("My Project")
  expect(body.project.description).toBe("A test project")
  expect(body.project.id).toMatch(/^proj_/)
  expect(body.project.directory).toBe(`${COS_BASE_PATH}/${body.project.id}`)
  expect(body.project.status).toBe("active")
})

// 2. Creating a project creates the directory on disk
test("creating a project creates the directory on disk", async () => {
  const token = await registerUser("dev2", "dev2@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "DirCheck" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  const dirStat = await stat(body.project.directory)
  expect(dirStat.isDirectory()).toBe(true)
})

// 3. Creating a project is listed
test("creating a project is listed", async () => {
  const token = await registerUser("dev3", "dev3@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "WorkDirCheck" }),
    }),
  )
  const body = await res.json() as Record<string, any>

  const wdRes = await app.fetch(
    new Request(`http://localhost/api/platform/projects`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const wdBody = (await wdRes.json()) as any
  const project = wdBody.projects.find((p: any) => p.id === body.project.id)
  expect(project).toBeDefined()
})

// 4. User can list own projects
test("user can list own projects", async () => {
  const token = await registerUser("dev4", "dev4@example.com")

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Project A" }),
    }),
  )
  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Project B" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.projects.length).toBe(2)
  expect(body.projects[0].name).toBe("Project B") // DESC order
  expect(body.projects[1].name).toBe("Project A")
})

// 5. User cannot see other user's projects
test("user cannot see other users projects", async () => {
  const tokenA = await registerUser("deva", "deva@example.com")
  const tokenB = await registerUser("devb", "devb@example.com")

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: "A's Project" }),
    }),
  )

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ name: "B's Project" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${tokenA}` },
    }),
  )
  const body = (await res.json()) as any
  expect(body.projects.length).toBe(1)
  expect(body.projects[0].name).toBe("A's Project")
})

// 6. Archiving a project sets status
test("archiving a project sets status", async () => {
  const token = await registerUser("dev6", "dev6@example.com")

  const create = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "ToArchive" }),
    }),
  )
  const { project } = await create.json() as any

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "archived" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.project.status).toBe("archived")
})

// 7. Creating project with empty name returns 400
test("creating project with empty name returns 400", async () => {
  const token = await registerUser("dev7", "dev7@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "" }),
    }),
  )
  expect(res.status).toBe(400)
})

// ---------------------------------------------------------------------------
// 8. GET /projects/:id returns project info
// ---------------------------------------------------------------------------
test("GET /projects/:id returns project details", async () => {
  const token = await registerUser("dev8", "dev8@example.com")

  const create = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Detail Project", description: "A detailed project" }),
    }),
  )
  const { project: created } = await create.json() as any

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${created.id}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.project.id).toBe(created.id)
  expect(body.project.name).toBe("Detail Project")
  expect(body.project.description).toBe("A detailed project")
  expect(body.project.directory).toBeDefined()
  expect(body.project.status).toBe("active")
  expect(body.project.createdAt).toBeDefined()
  expect(body.project.updatedAt).toBeDefined()
})

// ---------------------------------------------------------------------------
// 9. GET /projects/:id not found → 404
// ---------------------------------------------------------------------------
test("GET /projects/:id non-existent project returns 404", async () => {
  const token = await registerUser("dev9", "dev9@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_nonexistent", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("NOT_FOUND")
})

// ---------------------------------------------------------------------------
// 10. GET /projects/:id another users project → 403
// ---------------------------------------------------------------------------
test("GET /projects/:id another users project returns 403", async () => {
  const tokenA = await registerUser("dev10a", "dev10a@example.com")
  const tokenB = await registerUser("dev10b", "dev10b@example.com")

  const create = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: "A's Private Project" }),
    }),
  )
  const { project } = await create.json() as any

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${project.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  )
  expect(res.status).toBe(403)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("FORBIDDEN")
})

// ---------------------------------------------------------------------------
// 11. GET /projects/:id without auth → 401
test("GET /projects/:id without token returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_xxx"),
  )
  expect(res.status).toBe(401)
})

// ---------------------------------------------------------------------------
// 12. Project creation scaffolds AGENTS.md
// ---------------------------------------------------------------------------
test("project creation scaffolds AGENTS.md", async () => {
  const token = await registerUser("dev12", "dev12@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "ScaffoldTest" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  expect(res.status).toBe(201)

  const { readFile } = await import("node:fs/promises")
  const { join } = await import("node:path")

  const agentsContent = await readFile(join(body.project.directory, "AGENTS.md"), "utf-8")
  expect(agentsContent).toContain("# ScaffoldTest")
  expect(agentsContent).toContain("Canonical Layout")
  expect(agentsContent).toContain("Rules for AI Agents")
  expect(agentsContent).toContain("story/*.json")
})

// ---------------------------------------------------------------------------
// 13. Project creation scaffolds openimago.json
// ---------------------------------------------------------------------------
test("project creation scaffolds openimago.json", async () => {
  const token = await registerUser("dev13", "dev13@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "ManifestTest" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  expect(res.status).toBe(201)

  const { readFile } = await import("node:fs/promises")
  const { join } = await import("node:path")

  const manifestContent = await readFile(join(body.project.directory, "openimago.json"), "utf-8")
  const manifest = JSON.parse(manifestContent) as Record<string, unknown>
  expect(manifest.schemaVersion).toBe(1)
  expect(manifest.projectId).toBe(body.project.id)
  expect(manifest.storyPath).toBe("story/")
  expect(manifest.outputsPath).toBe("outputs/")
  expect(typeof manifest.createdAt).toBe("string")
})

// ---------------------------------------------------------------------------
// 14. Project creation scaffolds story JSON files
// ---------------------------------------------------------------------------
test("project creation scaffolds story JSON files", async () => {
  const token = await registerUser("dev14", "dev14@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "StoryTest" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  expect(res.status).toBe(201)

  const { readFile, access } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const dir = body.project.directory

  // Verify all story files exist
  const storyFiles = [
    "story/bible.json",
    "story/series.json",
    "story/episodes/ep_001.json",
    "story/workflow/ep_001.workflow.json",
    "story/runs/ep_001.runs.json",
  ]

  for (const relPath of storyFiles) {
    const fullPath = join(dir, relPath)
    // Should not throw — file exists
    await access(fullPath)
    const content = await readFile(fullPath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    expect(parsed.schemaVersion).toBe(1)
    // Each story file has either projectId, episodeId, or id as its identity field
    expect(parsed.projectId ?? parsed.episodeId ?? parsed.id).toBeDefined()
  }

  // bible.json should have the project name as world name
  const bibleContent = await readFile(join(dir, "story/bible.json"), "utf-8")
  const bible = JSON.parse(bibleContent) as Record<string, unknown>
  const world = bible.world as Record<string, unknown>
  expect(world.name).toBe("StoryTest")
})

// ---------------------------------------------------------------------------
// 15. Story JSON has valid schemaVersion field
// ---------------------------------------------------------------------------
test("scaffolded story JSON files have valid schemaVersion", async () => {
  const token = await registerUser("dev15", "dev15@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "SchemaVersionTest" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  expect(res.status).toBe(201)

  const { readFile } = await import("node:fs/promises")
  const { join } = await import("node:path")
  const dir = body.project.directory

  // openimago.json
  const m = JSON.parse(await readFile(join(dir, "openimago.json"), "utf-8"))
  expect(m.schemaVersion).toBe(1)

  // bible.json
  const b = JSON.parse(await readFile(join(dir, "story/bible.json"), "utf-8"))
  expect(b.schemaVersion).toBe(1)

  // series.json
  const s = JSON.parse(await readFile(join(dir, "story/series.json"), "utf-8"))
  expect(s.schemaVersion).toBe(1)

  // episode
  const e = JSON.parse(await readFile(join(dir, "story/episodes/ep_001.json"), "utf-8"))
  expect(e.schemaVersion).toBe(1)

  // workflow
  const w = JSON.parse(await readFile(join(dir, "story/workflow/ep_001.workflow.json"), "utf-8"))
  expect(w.schemaVersion).toBe(1)

  // runs
  const r = JSON.parse(await readFile(join(dir, "story/runs/ep_001.runs.json"), "utf-8"))
  expect(r.schemaVersion).toBe(1)
})
