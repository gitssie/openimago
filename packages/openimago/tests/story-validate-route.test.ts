import { test, expect, beforeAll, afterAll } from "bun:test"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { storyValidateRoutes } from "../src/project/story-routes"
import { verificationStore } from "../src/auth/email-verification"
import { db } from "../src/db/client"
import { projects, workspaceGeneratedFiles } from "../src/db/schema"
import { WorkspaceTable } from "../src/db/workspace-schema"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
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

function validateReq(token: string | null, projectId: string) {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return app.fetch(
    new Request(`http://localhost/api/platform/projects/${projectId}/story/validate`, {
      method: "GET",
      headers,
    }),
  )
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/projects", storyValidateRoutes)
})

afterAll(async () => {
  await teardown()
})

test("GET /story/validate returns ok:true for a freshly scaffolded project", async () => {
  const token = await registerUser("validateuser", "validate@example.com")
  const project = await createProject(token, "Validate Me")

  const res = await validateReq(token, project.id)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { validation: { ok: boolean; errors: unknown[] } }
  expect(body.validation.ok).toBe(true)
  expect(body.validation.errors).toEqual([])
})

test("GET /story/validate is 403 for a non-owner", async () => {
  const owner = await registerUser("vowner", "vowner@example.com")
  const project = await createProject(owner, "Owned")
  const intruder = await registerUser("vintruder", "vintruder@example.com")

  const res = await validateReq(intruder, project.id)
  expect(res.status).toBe(403)
})

test("GET /story/validate is 404 for an unknown project", async () => {
  const token = await registerUser("vmissing", "vmissing@example.com")
  const res = await validateReq(token, "proj_does_not_exist")
  expect(res.status).toBe(404)
})

test("a stamped artifact not referenced by any run surfaces an ORPHAN_ARTIFACT warning", async () => {
  const token = await registerUser("vorphan", "vorphan@example.com")
  const project = await createProject(token, "Orphan Co")
  const ownerId = (
    await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, project.id))
  )[0]!.userId

  // Link a workspace to the project (loadArtifacts joins on WorkspaceTable.project_id).
  const wid = `wrk_orphan_${Date.now().toString(36)}`
  await db.insert(WorkspaceTable).values({
    id: wid,
    type: "worktree",
    name: "",
    directory: `/opt/work/${wid}`,
    project_id: project.id,
    time_used: Date.now(),
    userId: ownerId,
  })

  // An artifact stamped (via the generate-image tool's inputArgs → genRun) with a
  // shotId, but referenced by NO run → orphan. project_id on the session row is
  // always "global" (opencode), so identity flows through the workspace join.
  const now = new Date()
  await db.insert(workspaceGeneratedFiles).values({
    id: "wsf_orphan_stamp_001",
    sessionId: "ses_orphan",
    workspaceId: wid,
    kind: "image",
    mimeType: "image/png",
    filename: "orphan.png",
    accessLocators: { preview: { href: "http://cdn.example.com/orphan.png" } },
    metadata: { genRun: { inputArgs: { shotId: "s01-opening", nodeId: "n07" } } },
    status: "active",
    createdAt: now,
    updatedAt: now,
  })

  const res = await validateReq(token, project.id)
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    validation: { ok: boolean; warnings: { code: string }[] }
  }
  // Orphans are warnings, not errors — the scaffolded story is still ok.
  expect(body.validation.ok).toBe(true)
  expect(body.validation.warnings.map((w) => w.code)).toContain("ORPHAN_ARTIFACT")
})
