import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { setup, teardown, setupSessionTable } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { SessionTable } from "../src/db/session-schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { db } from "../src/db/client"
import { workspaceGeneratedFiles, projects } from "../src/db/schema"

const SESSION_ID = "test-session-wsf-001"

let app: Hono

interface Registration {
  token: string
  workspaceId: string
}

async function registerUser(email: string): Promise<Registration> {
  const a = new Hono()
  a.route("/auth", authRoutes)
  const res = await a.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  return { token: body.token as string, workspaceId: body.user.workspaceId as string }
}

/** Upsert a session record with the given workspace_id so the service perimeter check passes. */
async function ensureSession(id: string, workspaceId: string) {
  await db
    .insert(SessionTable)
    .values({
      id,
      project_id: "global",
      workspace_id: workspaceId,
      slug: "test-session-wsf",
      directory: "/tmp/wsf-test-dir",
      title: "Workspace Files Test",
      version: "0",
      time_created: Date.now(),
      time_updated: Date.now(),
    })
    .onConflictDoUpdate({
      target: SessionTable.id,
      set: { workspace_id: workspaceId },
    })
}

async function buildWorkspaceFilesApp(): Promise<Hono> {
  const { workspaceFilesRoutes, sessionWorkspaceFilesRoutes } = await import(
    "../src/workspace-files/routes"
  )

  const a = new Hono()
  a.route("/auth", authRoutes)

  // Mount routes exactly as the production app does — each router owns its
  // auth middleware (JWT and/or x-api-key service channel).
  a.route("/api/platform/workspace-files", workspaceFilesRoutes)
  a.route("/api/platform/sessions", sessionWorkspaceFilesRoutes)

  return a
}

const SERVICE_API_KEY = "test-service-key-wsf"

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  process.env.OPENIMAGO_INTERNAL_API_KEY = SERVICE_API_KEY
  app = await buildWorkspaceFilesApp()
})

afterAll(async () => {
  delete process.env.OPENIMAGO_INTERNAL_API_KEY
  await teardown()
})

// ---------------------------------------------------------------------------
// Schema regression: table exists
// ---------------------------------------------------------------------------
describe("workspace-files schema", () => {
  test("workspace_generated_files table exists and supports insert/select", async () => {
    const now = new Date()
    await db.insert(workspaceGeneratedFiles).values({
      id: "wsf_test_001",
      sessionId: SESSION_ID,
      workspaceId: null,
      kind: "image",
      mimeType: "image/png",
      filename: "test.png",
      width: 100,
      height: 200,
      accessLocators: { preview: { href: "http://example.com/test.png" } },
      metadata: { source: "t2i" },
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    const rows = await db
      .select()
      .from(workspaceGeneratedFiles)
      .where(eq(workspaceGeneratedFiles.id, "wsf_test_001"))

    expect(rows.length).toBe(1)
    const row = rows[0]!
    expect(row.id).toBe("wsf_test_001")
    expect(row.kind).toBe("image")
    expect(row.mimeType).toBe("image/png")
    expect(row.width).toBe(100)
    expect(row.height).toBe(200)
    expect(row.filename).toBe("test.png")
    expect(row.accessLocators).toEqual({ preview: { href: "http://example.com/test.png" } })
    expect((row.metadata as Record<string, unknown>).source).toBe("t2i")
    expect(row.status).toBe("active")
  })
})

// ---------------------------------------------------------------------------
// Route tests
// ---------------------------------------------------------------------------
describe("workspace-files routes", () => {
  test("POST /api/platform/workspace-files registers a file", async () => {
    const reg = await registerUser("wsfreg@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${reg.token}`,
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "image",
          mime: "image/png",
          filename: "output.png",
          width: 512,
          height: 512,
          accessPreviewHref: "http://cdn.example.com/preview.png",
          accessDownloadHref: "http://cdn.example.com/download.png",
          accessThumbnailHref: "http://cdn.example.com/thumb.png",
          prompt: "a cat",
          provider: "openai",
          model: "dall-e-3",
          metadata: { seed: 42 },
        }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, any>
    expect(body.workspaceFileId).toMatch(/^wsf_/)
    expect(body.result.workspaceFileId).toMatch(/^wsf_/)
    expect(body.result.kind).toBe("image")
    expect(body.result.mime).toBe("image/png")
    expect(body.result.filename).toBe("output.png")
    expect(body.result.width).toBe(512)
    expect(body.result.height).toBe(512)
    expect(body.result.access.preview.href).toBe("http://cdn.example.com/preview.png")
    expect(body.result.access.download!.href).toBe("http://cdn.example.com/download.png")
    expect(body.result.access.thumbnail!.href).toBe("http://cdn.example.com/thumb.png")
    expect(body.result.prompt).toBe("a cat")
    expect(body.result.provider).toBe("openai")
    expect(body.result.model).toBe("dall-e-3")
    expect(body.result.metadata.seed).toBe(42)
    expect(body.result.createdAt).toBeDefined()
  })

  test("POST /api/platform/workspace-files rejects invalid kind", async () => {
    const reg = await registerUser("wsfbad@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${reg.token}`,
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "document",
          mime: "application/pdf",
          accessPreviewHref: "http://cdn.example.com/doc.pdf",
        }),
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("INVALID_KIND")
  })

  test("POST /api/platform/workspace-files returns 404 for non-existent session", async () => {
    const reg = await registerUser("wsfnosess@example.com")

    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${reg.token}`,
        },
        body: JSON.stringify({
          sessionId: "nonexistent-session",
          kind: "image",
          mime: "image/png",
          accessPreviewHref: "http://cdn.example.com/img.png",
        }),
      }),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("NOT_FOUND")
  })

  test("GET /api/platform/sessions/:id/workspace-files lists files", async () => {
    const reg = await registerUser("wsflist@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    // Register a file first
    const create = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${reg.token}`,
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "video",
          mime: "video/mp4",
          filename: "clip.mp4",
          duration: 10.5,
          accessPreviewHref: "http://cdn.example.com/clip.mp4",
          prompt: "a running dog",
          provider: "runway",
          model: "gen-3",
        }),
      }),
    )
    expect(create.status).toBe(201)

    const res = await app.fetch(
      new Request(
        `http://localhost/api/platform/sessions/${SESSION_ID}/workspace-files`,
        {
          headers: { authorization: `Bearer ${reg.token}` },
        },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(Array.isArray(body.workspaceFiles)).toBe(true)
    expect(body.workspaceFiles.length).toBeGreaterThanOrEqual(1)

    const file = body.workspaceFiles[0]
    expect(file.kind).toBe("video")
    expect(file.mime).toBe("video/mp4")
    expect(file.duration).toBe(10.5)
    expect(file.prompt).toBe("a running dog")
  })

  test("GET /api/platform/sessions/:id/workspace-files returns 404 for non-existent session", async () => {
    const reg = await registerUser("wsflist404@example.com")

    const res = await app.fetch(
      new Request(
        "http://localhost/api/platform/sessions/nonexistent-session/workspace-files",
        {
          headers: { authorization: `Bearer ${reg.token}` },
        },
      ),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("NOT_FOUND")
  })

  test("POST /api/platform/workspace-files requires auth", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "image",
          mime: "image/png",
          accessPreviewHref: "http://cdn.example.com/img.png",
        }),
      }),
    )

    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// Service auth channel (x-api-key) — for trusted backend callers (OpenCode plugin)
// ---------------------------------------------------------------------------
describe("workspace-files service auth (x-api-key)", () => {
  test("registers a file with a valid x-api-key and no JWT", async () => {
    const reg = await registerUser("wsfsvc@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": SERVICE_API_KEY,
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "image",
          mime: "image/png",
          filename: "svc.png",
          width: 256,
          height: 256,
          accessPreviewHref: "http://cdn.example.com/svc-preview.png",
          prompt: "service registered cat",
          provider: "mock-image",
          model: "mock-image-model",
        }),
      }),
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, any>
    expect(body.workspaceFileId).toMatch(/^wsf_/)
    expect(body.result.kind).toBe("image")
    expect(body.result.access.preview.href).toBe("http://cdn.example.com/svc-preview.png")
    expect(body.result.provider).toBe("mock-image")
  })

  test("rejects when x-api-key is invalid", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "wrong-key",
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "image",
          mime: "image/png",
          accessPreviewHref: "http://cdn.example.com/img.png",
        }),
      }),
    )

    expect(res.status).toBe(401)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  test("returns 404 for non-existent session on the service channel", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": SERVICE_API_KEY,
        },
        body: JSON.stringify({
          sessionId: "service-nonexistent-session",
          kind: "image",
          mime: "image/png",
          accessPreviewHref: "http://cdn.example.com/img.png",
        }),
      }),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

// ---------------------------------------------------------------------------
// Mounting regression: the real createApp() must expose the workspace-files
// routes. Without this, /api/platform/workspace-files falls through to the
// proxy catch-all (JWT-only) and the service channel 401s — the e2e bug
// that left the AI-outputs panel empty (openimago-y21b).
// ---------------------------------------------------------------------------
describe("workspace-files routes are mounted in the production app", () => {
  test("POST /api/platform/workspace-files is reachable via createApp() service channel", async () => {
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const reg = await registerUser("wsfmount@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    const res = await realApp.fetch(
      new Request("http://localhost/api/platform/workspace-files", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": SERVICE_API_KEY,
        },
        body: JSON.stringify({
          sessionId: SESSION_ID,
          kind: "image",
          mime: "image/png",
          accessPreviewHref: "https://picsum.photos/seed/mount/512",
        }),
      }),
    )

    // 201 proves the route is mounted AND the service-auth channel works.
    // A 401/404 here means the route was never registered in app.ts.
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, any>
    expect(body.workspaceFileId).toMatch(/^wsf_/)
  })

  test("GET /api/platform/sessions/:id/workspace-files is reachable via createApp()", async () => {
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const reg = await registerUser("wsfmountlist@example.com")
    await ensureSession(SESSION_ID, reg.workspaceId)

    const res = await realApp.fetch(
      new Request(
        `http://localhost/api/platform/sessions/${SESSION_ID}/workspace-files`,
        { headers: { authorization: `Bearer ${reg.token}` } },
      ),
    )

    // 200 proves the GET route is mounted and not shadowed by workDir/outputs.
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(Array.isArray(body.workspaceFiles)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Project-level aggregation (openimago-owy7).
// Reliable identity = workspace.project_id (verified against live DB:
// session.directory is workspace-scoped, not project-scoped, so a directory
// join returns nothing; session.project_id is always "global").
// ---------------------------------------------------------------------------
describe("project-level workspace-files aggregation", () => {
  let userId: string
  let token: string
  let projectId: string
  let projectWorkspaceId: string

  /** Create a project owned by userId plus a workspace linked to it. */
  async function setupProjectWorkspace(uid: string, suffix: string) {
    const pid = `proj_wsf_${suffix}`
    const wid = `wrk_wsf_${suffix}`
    const dir = `/opt/work/${pid}`
    await db
      .insert(projects)
      .values({ id: pid, userId: uid, name: `P-${suffix}`, directory: dir })
      .onConflictDoUpdate({ target: projects.id, set: { userId: uid, directory: dir } })
    await db
      .insert(WorkspaceTable)
      .values({
        id: wid,
        type: "worktree",
        name: "",
        directory: `/opt/work/${wid}`,
        project_id: pid,
        time_used: Date.now(),
        userId: uid,
      })
      .onConflictDoUpdate({ target: WorkspaceTable.id, set: { project_id: pid } })
    return { pid, wid }
  }

  /** Insert an active generated file directly (bypassing the registration route). */
  async function insertFile(id: string, sessionId: string, workspaceId: string) {
    const now = new Date()
    await db.insert(workspaceGeneratedFiles).values({
      id,
      sessionId,
      workspaceId,
      kind: "image",
      mimeType: "image/png",
      filename: `${id}.png`,
      accessLocators: { preview: { href: `http://cdn.example.com/${id}.png` } },
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
  }

  beforeAll(async () => {
    const reg = await registerUser("wsfproj@example.com")
    token = reg.token
    // Resolve the userId from the issued token via the project we create.
    // We need the real userId — fetch it through /auth/me-equivalent: the
    // registration response embeds it indirectly via workspaceId, so instead
    // read it back from the users table by the workspace owner is overkill;
    // simplest: decode is unavailable, so create project via a known userId.
    const meApp = new Hono()
    meApp.route("/auth", authRoutes)
    const meRes = await meApp.fetch(
      new Request("http://localhost/auth/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const me = (await meRes.json()) as Record<string, any>
    userId = me.id as string

    const { pid, wid } = await setupProjectWorkspace(userId, "main")
    projectId = pid
    projectWorkspaceId = wid

    // Two sessions in the same project workspace, each with a file.
    await ensureSession("ses_wsf_proj_a", projectWorkspaceId)
    await ensureSession("ses_wsf_proj_b", projectWorkspaceId)
    await insertFile("wsf_proj_a1", "ses_wsf_proj_a", projectWorkspaceId)
    await insertFile("wsf_proj_b1", "ses_wsf_proj_b", projectWorkspaceId)
  })

  test("aggregates generated files across all sessions of the project", async () => {
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const res = await realApp.fetch(
      new Request(
        `http://localhost/api/platform/projects/${projectId}/workspace-files`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    const ids = body.workspaceFiles.map((f: Record<string, any>) => f.workspaceFileId)
    expect(ids).toContain("wsf_proj_a1")
    expect(ids).toContain("wsf_proj_b1")
  })

  test("returns an empty list for a project with no generated files", async () => {
    await setupProjectWorkspace(userId, "empty")
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const res = await realApp.fetch(
      new Request(
        `http://localhost/api/platform/projects/proj_wsf_empty/workspace-files`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.workspaceFiles).toEqual([])
  })

  test("rejects a project owned by another user with 403", async () => {
    const other = await registerUser("wsfprojother@example.com")
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const res = await realApp.fetch(
      new Request(
        `http://localhost/api/platform/projects/${projectId}/workspace-files`,
        { headers: { authorization: `Bearer ${other.token}` } },
      ),
    )

    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("FORBIDDEN")
  })

  test("returns 404 for a non-existent project", async () => {
    const { createApp } = await import("../src/server/app")
    const realApp = createApp()

    const res = await realApp.fetch(
      new Request(
        `http://localhost/api/platform/projects/proj_does_not_exist/workspace-files`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
    )

    expect(res.status).toBe(404)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("NOT_FOUND")
  })
})
