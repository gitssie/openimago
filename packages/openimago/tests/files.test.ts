import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { unlinkSync, existsSync, mkdirSync, mkdirSync as mkdirSync2, readdirSync, writeFileSync } from "fs"
import { join } from "path"
import { setup, teardown } from "./helper"
import { signJwt } from "../src/auth/jwt"
import { userId, projectId } from "../src/utils/ids"
import { db } from "../src/db/client"
import { users, projects } from "../src/db/schema"
import { eq } from "drizzle-orm"

const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/work"

let app: Hono

beforeAll(async () => {
  await setup()
  // Create /work directory for uploads in tests
  try { mkdirSync(COS_BASE_PATH, { recursive: true }) } catch {}
})

afterAll(async () => {
  await teardown()
})

async function buildApp(): Promise<Hono> {
  const { authMiddleware } = await import("../src/server/middleware")
  const { filesRoutes } = await import("../src/files/routes")

  const a = new Hono()
  const filesApp = new Hono()
  filesApp.use("*", authMiddleware)
  filesApp.route("/", filesRoutes)
  a.route("/api/platform/files", filesApp)
  return a
}

// Helper: create a regular user and return a JWT
async function createUser(email: string, username: string): Promise<{ token: string; id: string }> {
  const id = userId()
  const now = new Date()
  await db.insert(users).values({
    id,
    username,
    email,
    displayName: null,
    workspaceId: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
  })
  const token = await signJwt({ userId: id, role: "user" })
  return { token, id }
}

// Helper: create a project for a user
async function createProject(userId: string, name: string): Promise<string> {
  const id = projectId()
  const fullPath = `${COS_BASE_PATH}/${id}`
  const now = new Date()
  await db.insert(projects).values({
    id,
    userId,
    name,
    description: null,
    directory: fullPath,
    status: "active",
    createdAt: now,
    updatedAt: now,
  })
  mkdirSync(fullPath, { recursive: true })
  return id
}

function makeFormData(fileName: string, content: string, extraFields?: Record<string, string>): FormData {
  const fd = new FormData()
  fd.append("file", new Blob([content], { type: "text/plain" }), fileName)
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      fd.append(key, value)
    }
  }
  return fd
}

// ---------------------------------------------------------------------------
// 1. Upload file to project directory → 201
// ---------------------------------------------------------------------------
test("upload file to project directory returns 201", async () => {
  const { token, id: userId } = await createUser("file-uploader@example.com", "fileuploader")
  const projId = await createProject(userId, "my-project")

  const app = await buildApp()
  const fd = makeFormData("hello.txt", "Hello World", { projectId: projId })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.file.name).toBe("hello.txt")
  expect(body.file.size).toBe(11)
  expect(body.file.path).toContain(projId)
  expect(body.file.path).toContain("hello.txt")
  expect(typeof body.file.relativePath).toBe("string")

  // Verify file exists on disk
  expect(existsSync(body.file.path)).toBe(true)
  // Cleanup
  try { unlinkSync(body.file.path) } catch {}
})

// ---------------------------------------------------------------------------
// 2. Upload file to standalone directory → 201
// ---------------------------------------------------------------------------
test("upload file to standalone directory returns 201", async () => {
  const { token } = await createUser("standalone-upload@example.com", "standaloneup")

  const app = await buildApp()
  const fd = makeFormData("standalone.txt", "standalone content")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.file.name).toBe("standalone.txt")
  expect(body.file.path).toContain(COS_BASE_PATH)

  // Cleanup
  try { unlinkSync(body.file.path) } catch {}
})

// ---------------------------------------------------------------------------
// 3. Upload to subdirectory → 201
// ---------------------------------------------------------------------------
test("upload to subdirectory creates file in nested path", async () => {
  const { token, id: userId } = await createUser("subdir-upload@example.com", "subdirup")
  const projId = await createProject(userId, "subdir-project")

  const app = await buildApp()
  const fd = makeFormData("code.ts", "console.log(1)", {
    projectId: projId,
    directory: "src/utils",
  })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.file.name).toBe("code.ts")
  expect(body.file.path).toContain("src/utils/code.ts")
  expect(body.file.relativePath).toContain("src/utils")

  // Cleanup
  try { unlinkSync(body.file.path) } catch {}
})

// ---------------------------------------------------------------------------
// 4. No file → 400
// ---------------------------------------------------------------------------
test("upload without file returns 400", async () => {
  const { token } = await createUser("nofile@example.com", "nofileuser")

  const app = await buildApp()
  const fd = new FormData()
  fd.append("projectId", "proj_123")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ---------------------------------------------------------------------------
// 5. projectId not found → 404
// ---------------------------------------------------------------------------
test("upload to non-existent project returns 404", async () => {
  const { token } = await createUser("no-proj@example.com", "noproj")

  const app = await buildApp()
  const fd = makeFormData("file.txt", "content", { projectId: "proj_nonexistent" })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(404)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("NOT_FOUND")
})

// ---------------------------------------------------------------------------
// 6. projectId belongs to another user → 403
// ---------------------------------------------------------------------------
test("upload to another user's project returns 403", async () => {
  const { id: ownerId } = await createUser("owner@example.com", "owner")
  const projId = await createProject(ownerId, "owners-project")
  const { token } = await createUser("thief@example.com", "thief")

  const app = await buildApp()
  const fd = makeFormData("stolen.txt", "evil", { projectId: projId })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(403)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("FORBIDDEN")
})

// ---------------------------------------------------------------------------
// 7. File exceeds size limit → 400
// ---------------------------------------------------------------------------
test("upload file exceeding size limit returns 400", async () => {
  const { token, id: userId } = await createUser("bigfile@example.com", "bigfileuser")
  const projId = await createProject(userId, "big-project")

  // Set tiny size limit for this test via env
  const oldMaxSize = process.env.MAX_UPLOAD_SIZE
  process.env.MAX_UPLOAD_SIZE = "10" // 10 bytes max

  // Re-import service to pick up new env var
  const app = await buildApp()
  const fd = makeFormData("big.txt", "this is more than 10 bytes")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )

  process.env.MAX_UPLOAD_SIZE = oldMaxSize

  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ---------------------------------------------------------------------------
// 8. File already exists → 409
// ---------------------------------------------------------------------------
test("upload duplicate file returns 409", async () => {
  const { token, id: userId } = await createUser("dupe-file@example.com", "dupefile")
  const projId = await createProject(userId, "dupe-project")

  const app = await buildApp()

  // First upload
  const fd1 = makeFormData("duplicate.txt", "first", { projectId: projId })
  const res1 = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd1,
    }),
  )
  expect(res1.status).toBe(201)
  const body1 = await res1.json() as Record<string, any>

  // Second upload of same file
  const fd2 = makeFormData("duplicate.txt", "second", { projectId: projId })
  const res2 = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd2,
    }),
  )
  expect(res2.status).toBe(409)
  const body2 = await res2.json() as Record<string, any>
  expect(body2.error.code).toBe("CONFLICT")

  // Cleanup first upload
  try { unlinkSync(body1.file.path) } catch {}
})

// ---------------------------------------------------------------------------
// 9. Filename with path traversal ".." → 400
// ---------------------------------------------------------------------------
test("upload file with '..' in name returns 400", async () => {
  const { token, id: userId } = await createUser("path-traversal@example.com", "pathtrav")
  const projId = await createProject(userId, "safe-project")

  const app = await buildApp()
  const fd = makeFormData("../etc/passwd", "hack", { projectId: projId })

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: fd,
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ---------------------------------------------------------------------------
// 10. No token → 401
// ---------------------------------------------------------------------------
test("upload without token returns 401", async () => {
  const app = await buildApp()
  const fd = makeFormData("noauth.txt", "content")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/files/upload", {
      method: "POST",
      body: fd,
    }),
  )
  expect(res.status).toBe(401)
})

// ===========================================================================
// Project files — GET /api/platform/projects/:id/files
// ===========================================================================

async function buildProjectFilesApp(): Promise<Hono> {
  const { authRoutes } = await import("../src/auth/routes")
  const { projectFilesRoutes } = await import("../src/files/routes")
  const a = new Hono()
  a.route("/auth", authRoutes)
  a.route("/api/platform/projects", projectFilesRoutes)
  return a
}

// 11. List project files returns file entries
test("GET /projects/:id/files returns files in project directory", async () => {
  const { token, id: userId } = await createUser("pfiles-user@example.com", "pfilesuser")
  const projId = await createProject(userId, "Files Project")
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projId))
  const projDir = project[0]!.directory

  writeFileSync(join(projDir, "index.html"), "<html></html>")
  writeFileSync(join(projDir, "styles.css"), "body {}")
  writeFileSync(join(projDir, "README.md"), "# Hello")

  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/files`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(Array.isArray(body.files)).toBe(true)
  expect(body.files.length).toBe(3)

  const names = body.files.map((f: any) => f.name).sort()
  expect(names).toEqual(["README.md", "index.html", "styles.css"])

  for (const f of body.files) {
    expect(typeof f.name).toBe("string")
    expect(typeof f.path).toBe("string")
    expect(typeof f.size).toBe("number")
    expect(typeof f.type).toBe("string")
    expect(typeof f.modifiedAt).toBe("string")
  }

  const htmlFile = body.files.find((f: any) => f.name === "index.html")
  expect(htmlFile.type).toBe("text/html")
  const cssFile = body.files.find((f: any) => f.name === "styles.css")
  expect(cssFile.type).toBe("text/css")
  const mdFile = body.files.find((f: any) => f.name === "README.md")
  expect(mdFile.type).toBe("text/markdown")
})

// 12. Project not found → 404
test("GET /projects/:id/files non-existent project returns 404", async () => {
  const { token } = await createUser("pfiles-404@example.com", "pfiles404")

  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_nonexistent/files", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
})

// 13. Another user's project → 403
test("GET /projects/:id/files another users project returns 403", async () => {
  const { id: ownerId } = await createUser("pfiles-owner@example.com", "pfilesowner")
  const projId = await createProject(ownerId, "Owner's Files Project")

  const { token } = await createUser("pfiles-other@example.com", "pfilesother")

  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/files`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(403)
})

// 14. Hidden files and .thumbnails are filtered
test("GET /projects/:id/files filters hidden files and thumbnails", async () => {
  const { token, id: userId } = await createUser("pfiles-filter@example.com", "pfilesfilter")
  const projId = await createProject(userId, "Filter Files Project")
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projId))
  const projDir = project[0]!.directory

  writeFileSync(join(projDir, "visible.txt"), "hello")
  writeFileSync(join(projDir, ".gitignore"), "node_modules")
  writeFileSync(join(projDir, ".env"), "SECRET=1")
  mkdirSync2(join(projDir, ".thumbnails"), { recursive: true })
  writeFileSync(join(projDir, ".thumbnails", "thumb.png"), "thumb")

  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/files`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  const names = body.files.map((f: any) => f.name)
  expect(names).toContain("visible.txt")
  expect(names).not.toContain(".gitignore")
  expect(names).not.toContain(".env")
  expect(names).not.toContain(".thumbnails")
})

// 15. Empty directory → empty array
test("GET /projects/:id/files empty directory returns empty array", async () => {
  const { token, id: userId } = await createUser("pfiles-empty@example.com", "pfilesempty")
  const projId = await createProject(userId, "Empty Files Project")

  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${projId}/files`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.files).toEqual([])
})

// 16. No token → 401
test("project files without token returns 401", async () => {
  const app = await buildProjectFilesApp()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects/proj_xxx/files"),
  )
  expect(res.status).toBe(401)
})
