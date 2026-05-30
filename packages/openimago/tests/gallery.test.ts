import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { setup, teardown, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  const a = new Hono()
  a.route("/auth", authRoutes)
  const res = await a.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.token as string
}

beforeAll(async () => {
  await setup()
})

afterAll(async () => {
  await teardown()
})

async function buildApp(): Promise<Hono> {
  const { authMiddleware } = await import("../src/server/middleware")
  const { galleryRoutes, galleryFilesRoutes } = await import("../src/gallery/routes")

  const a = new Hono()
  a.route("/auth", authRoutes)

  const galleryApp = new Hono()
  galleryApp.use("*", authMiddleware)
  galleryApp.route("/", galleryRoutes)

  const filesApp = new Hono()
  filesApp.use("*", authMiddleware)
  filesApp.route("/", galleryFilesRoutes)

  a.route("/api/platform/gallery", galleryApp)
  a.route("/api/platform/gallery/files", filesApp)
  return a
}

// ── Helper: create a manifest + images for import tests ──

function createTestManifest(): { manifestPath: string; imageDir: string; manifest: Record<string, any> } {
  const baseDir = join(COS_BASE_PATH, "test-gallery-import")
  mkdirSync(baseDir, { recursive: true })
  const imageDir = join(baseDir, "images")
  mkdirSync(imageDir, { recursive: true })

  // Create a simple test image (1x1 pixel PNG)
  // Minimal valid PNG: 8-byte signature + IHDR + IDAT + IEND
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x75, 0x01, 0x07,
    0xbc, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82,
  ])

  writeFileSync(join(imageDir, "test-poster.png"), pngBytes)
  writeFileSync(join(imageDir, "test-product.png"), pngBytes)
  writeFileSync(join(imageDir, "test-char.png"), pngBytes)

  const manifest = {
    works: [
      { slug: "test-poster-01", title: "Test Poster", category: "poster", tags: ["科幻", "测试"], prompt: "A test poster prompt", imageFile: "test-poster.png", sortOrder: 10 },
      { slug: "test-product-01", title: "Test Product", category: "product", tags: ["科技"], prompt: "A test product prompt", imageFile: "test-product.png", sortOrder: 20 },
      { slug: "test-char-01", title: "Test Character", category: "character", tags: ["奇幻"], prompt: "A test character prompt", imageFile: "test-char.png", sortOrder: 30 },
    ],
  }

  const manifestPath = join(baseDir, "manifest.json")
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  return { manifestPath, imageDir, manifest }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Gallery Import", () => {
  test("POST /import creates works and returns stats", async () => {
    const token = await registerUser("galimport1", "galim1@example.com")
    const app = await buildApp()
    const { manifestPath, imageDir } = createTestManifest()

    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manifestPath, imageDir }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.result.total).toBe(3)
    expect(body.result.created).toBe(3)
    expect(body.result.updated).toBe(0)
    expect(body.result.failed).toBe(0)
    expect(body.result.errors).toEqual([])

    // Clean up
    try { rmSync(manifestPath) } catch { /* ignore */ }
  })

  test("POST /import — re-import with same slugs upserts (updated: 3)", async () => {
    const token = await registerUser("galimport2", "galim2@example.com")
    const app = await buildApp()
    const { manifestPath, imageDir } = createTestManifest()

    // First import
    await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manifestPath, imageDir }),
      }),
    )

    // Second import (same slugs)
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manifestPath, imageDir }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.result.total).toBe(3)
    expect(body.result.created).toBe(0)
    expect(body.result.updated).toBe(3)
    expect(body.result.failed).toBe(0)

    try { rmSync(manifestPath) } catch { /* ignore */ }
  })

  test("POST /import with missing manifestPath returns 400", async () => {
    const token = await registerUser("galimport3", "galim3@example.com")
    const app = await buildApp()

    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageDir: "/tmp" }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LIST tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Gallery List", () => {
  let token: string
  let app: Hono

  beforeAll(async () => {
    token = await registerUser("gallist1", "gallis1@example.com")
    app = await buildApp()

    // Seed data
    const { manifestPath, imageDir } = createTestManifest()
    await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manifestPath, imageDir }),
      }),
    )
    try { rmSync(manifestPath) } catch { /* ignore */ }
  })

  test("GET / returns all active works", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.items).toBeArray()
    expect(body.items.length).toBe(3)
    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  test("GET /?category=poster filters by category", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery?category=poster", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.items.length).toBe(1)
    expect(body.items[0].slug).toBe("test-poster-01")
    expect(body.items[0].category).toBe("poster")
  })

  test("GET /?category=all returns all works", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery?category=all", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.items.length).toBe(3)
  })

  test("GET /?limit=1 returns cursor-based pagination", async () => {
    const page1 = await app.fetch(
      new Request("http://localhost/api/platform/gallery?limit=1", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(page1.status).toBe(200)
    const p1 = await page1.json() as Record<string, any>
    expect(p1.items.length).toBe(1)
    expect(p1.hasMore).toBe(true)
    expect(p1.nextCursor).toBeString()

    const page2 = await app.fetch(
      new Request(`http://localhost/api/platform/gallery?limit=1&cursor=${encodeURIComponent(p1.nextCursor)}`, {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const p2 = await page2.json() as Record<string, any>
    expect(p2.items.length).toBe(1)
    // Should be a different slug from page 1
    expect(p2.items[0].slug).not.toBe(p1.items[0].slug)

    // The sort order should be ascending by sortOrder
    expect(p1.items[0].title).toBe("Test Poster")  // sortOrder 10
    expect(p2.items[0].title).toBe("Test Product") // sortOrder 20
  })

  test("GET / with invalid category returns 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery?category=invalid", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(400)
  })

  test("GET / returns card fields only (no prompt)", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const body = await res.json() as Record<string, any>
    expect(body.items[0].slug).toBeDefined()
    expect(body.items[0].title).toBeDefined()
    expect(body.items[0].category).toBeDefined()
    expect(body.items[0].tags).toBeDefined()
    expect(body.items[0].thumbnailUrl).toBeDefined()
    // prompt should NOT be in card response
    expect(body.items[0].prompt).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Gallery Detail", () => {
  let token: string
  let app: Hono

  beforeAll(async () => {
    token = await registerUser("galdet1", "galdet1@example.com")
    app = await buildApp()

    const { manifestPath, imageDir } = createTestManifest()
    await app.fetch(
      new Request("http://localhost/api/platform/gallery/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manifestPath, imageDir }),
      }),
    )
    try { rmSync(manifestPath) } catch { /* ignore */ }
  })

  test("GET /:slug returns full detail with prompt", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/test-poster-01", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, any>
    expect(body.item.slug).toBe("test-poster-01")
    expect(body.item.title).toBe("Test Poster")
    expect(body.item.category).toBe("poster")
    expect(body.item.prompt).toBe("A test poster prompt")
    expect(body.item.imageUrl).toBeDefined()
  })

  test("GET /:slug returns prevSlug=null for first work", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/test-poster-01", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const body = await res.json() as Record<string, any>
    // First by sort order (10), so prevSlug should be null
    expect(body.item.navigation.prevSlug).toBeNull()
    expect(body.item.navigation.nextSlug).toBe("test-product-01")
  })

  test("GET /:slug returns nextSlug=null for last work", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/test-char-01", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const body = await res.json() as Record<string, any>
    // Last by sort order (30), so nextSlug should be null
    expect(body.item.navigation.nextSlug).toBeNull()
    expect(body.item.navigation.prevSlug).toBe("test-product-01")
  })

  test("GET /:slug returns correct prev/next for middle work", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/test-product-01", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const body = await res.json() as Record<string, any>
    expect(body.item.navigation.prevSlug).toBe("test-poster-01")
    expect(body.item.navigation.nextSlug).toBe("test-char-01")
  })

  test("GET /:slug with nonexistent slug returns 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/nonexistent-slug", {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// AUTH tests
// ═══════════════════════════════════════════════════════════════════════════

describe("Gallery Auth", () => {
  test("GET / without auth returns 401", async () => {
    const app = await buildApp()
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery"),
    )
    expect(res.status).toBe(401)
  })

  test("GET /:slug without auth returns 401", async () => {
    const app = await buildApp()
    const res = await app.fetch(
      new Request("http://localhost/api/platform/gallery/test-poster-01"),
    )
    expect(res.status).toBe(401)
  })
})
