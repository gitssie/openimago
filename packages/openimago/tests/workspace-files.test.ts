import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { setup, teardown, setupSessionTable } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { SessionTable } from "../src/db/session-schema"
import { db } from "../src/db/client"
import { workspaceGeneratedFiles } from "../src/db/schema"

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
  const { authMiddleware } = await import("../src/server/middleware")
  const { workspaceFilesRoutes, sessionWorkspaceFilesRoutes } = await import(
    "../src/workspace-files/routes"
  )

  const a = new Hono()
  a.route("/auth", authRoutes)

  const platform = new Hono()
  platform.use("*", authMiddleware)
  platform.route("/workspace-files", workspaceFilesRoutes)

  const sessions = new Hono()
  sessions.use("*", authMiddleware)
  sessions.route("/sessions", sessionWorkspaceFilesRoutes)

  a.route("/api/platform", platform)
  a.route("/api/platform", sessions)

  return a
}

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  app = await buildWorkspaceFilesApp()
})

afterAll(async () => {
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
