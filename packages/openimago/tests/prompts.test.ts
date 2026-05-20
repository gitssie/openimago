import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { db } from "../src/db/client"

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
  const { promptsRoutes } = await import("../src/prompts/routes")

  const a = new Hono()
  a.route("/auth", authRoutes)

  const promptsApp = new Hono()
  promptsApp.use("*", authMiddleware)
  promptsApp.route("/", promptsRoutes)
  a.route("/api/platform/prompts", promptsApp)
  return a
}

// ---------------------------------------------------------------------------
// 1. Create template → 201
// ---------------------------------------------------------------------------
test("POST /prompts creates template", async () => {
  const token = await registerUser("tpluser1", "tpl1@example.com")
  const app = await buildApp()

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Product Shot",
        content: "Generate a product photo of {product} on white background",
        tags: ["产品摄影", "电商"],
      }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.template.id).toMatch(/^tpl_/)
  expect(body.template.title).toBe("Product Shot")
  expect(body.template.content).toContain("{product}")
  expect(body.template.tags).toEqual(["产品摄影", "电商"])
  expect(body.template.createdAt).toBeDefined()
  expect(body.template.updatedAt).toBeDefined()
})

// ---------------------------------------------------------------------------
// 2. Create with empty title → 400
// ---------------------------------------------------------------------------
test("POST /prompts with empty title returns 400", async () => {
  const token = await registerUser("tpluser2", "tpl2@example.com")
  const app = await buildApp()

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "", content: "some prompt" }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ---------------------------------------------------------------------------
// 3. List templates (order desc)
// ---------------------------------------------------------------------------
test("GET /prompts lists templates in desc order", async () => {
  const token = await registerUser("tpluser3", "tpl3@example.com")
  const app = await buildApp()

  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "First", content: "content1" }),
    }),
  )
  // Small delay to ensure different timestamps
  await new Promise((r) => setTimeout(r, 10))
  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Second", content: "content2" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.templates.length).toBeGreaterThanOrEqual(2)
  expect(body.total).toBeGreaterThanOrEqual(2)
  // Desc order: most recently updated first
  expect(body.templates[0].title).toBe("Second")
})

// ---------------------------------------------------------------------------
// 4. Filter by tag
// ---------------------------------------------------------------------------
test("GET /prompts?tag= filters by tag", async () => {
  const token = await registerUser("tpluser4", "tpl4@example.com")
  const app = await buildApp()

  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Photo", content: "photo prompt", tags: ["产品摄影"] }),
    }),
  )
  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Video", content: "video prompt", tags: ["视频"] }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts?tag=产品摄影", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.templates.length).toBe(1)
  expect(body.templates[0].title).toBe("Photo")
})

// ---------------------------------------------------------------------------
// 5. Search by keyword
// ---------------------------------------------------------------------------
test("GET /prompts?search= finds by title/content", async () => {
  const token = await registerUser("tpluser5", "tpl5@example.com")
  const app = await buildApp()

  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Landscape", content: "beautiful mountain scene" }),
    }),
  )
  await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Portrait", content: "studio lighting setup" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts?search=mountain", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.templates.length).toBe(1)
  expect(body.templates[0].title).toBe("Landscape")
})

// ---------------------------------------------------------------------------
// 6. Get single template
// ---------------------------------------------------------------------------
test("GET /prompts/:id returns single template", async () => {
  const token = await registerUser("tpluser6", "tpl6@example.com")
  const app = await buildApp()

  const create = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Single", content: "single prompt" }),
    }),
  )
  const { template } = await create.json() as Record<string, any>

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.template.id).toBe(template.id)
  expect(body.template.title).toBe("Single")
})

// ---------------------------------------------------------------------------
// 7. Get non-existent → 404
// ---------------------------------------------------------------------------
test("GET /prompts/:id non-existent returns 404", async () => {
  const token = await registerUser("tpluser7", "tpl7@example.com")
  const app = await buildApp()

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts/tpl_nonexistent", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 8. Get another user's template → 404
// ---------------------------------------------------------------------------
test("GET /prompts/:id for another user returns 404", async () => {
  const tokenA = await registerUser("tplA", "tplA@example.com")
  const tokenB = await registerUser("tplB", "tplB@example.com")
  const app = await buildApp()

  const create = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ title: "A's template", content: "secret" }),
    }),
  )
  const { template } = await create.json() as Record<string, any>

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    }),
  )
  expect(res.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 9. Update title
// ---------------------------------------------------------------------------
test("PATCH /prompts/:id updates title", async () => {
  const token = await registerUser("tpluser9", "tpl9@example.com")
  const app = await buildApp()

  const create = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Old Title", content: "content" }),
    }),
  )
  const { template } = await create.json() as Record<string, any>

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "New Title" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.template.title).toBe("New Title")
})

// ---------------------------------------------------------------------------
// 10. Update tags
// ---------------------------------------------------------------------------
test("PATCH /prompts/:id updates tags", async () => {
  const token = await registerUser("tpluser10", "tpl10@example.com")
  const app = await buildApp()

  const create = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Tagged", content: "content", tags: ["旧标签"] }),
    }),
  )
  const { template } = await create.json() as Record<string, any>

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tags: ["新标签", "产品摄影"] }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.template.tags).toEqual(["新标签", "产品摄影"])
})

// ---------------------------------------------------------------------------
// 11. Delete template
// ---------------------------------------------------------------------------
test("DELETE /prompts/:id deletes template", async () => {
  const token = await registerUser("tpluser11", "tpl11@example.com")
  const app = await buildApp()

  const create = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "DeleteMe", content: "delete me" }),
    }),
  )
  const { template } = await create.json() as Record<string, any>

  const del = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(del.status).toBe(200)

  // Verify gone
  const get = await app.fetch(
    new Request(`http://localhost/api/platform/prompts/${template.id}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(get.status).toBe(404)
})

// ---------------------------------------------------------------------------
// 12. Pagination offset/limit
// ---------------------------------------------------------------------------
test("GET /prompts supports offset/limit pagination", async () => {
  const token = await registerUser("tpluser12", "tpl12@example.com")
  const app = await buildApp()

  for (let i = 0; i < 5; i++) {
    await app.fetch(
      new Request("http://localhost/api/platform/prompts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: `Page ${i}`, content: `content ${i}` }),
      }),
    )
  }

  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts?limit=2&offset=0", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.templates.length).toBeLessThanOrEqual(2)
  expect(body.total).toBe(5)
})

// ---------------------------------------------------------------------------
// 13. createdAt/updatedAt auto-set on create
// ---------------------------------------------------------------------------
test("POST /prompts sets createdAt and updatedAt", async () => {
  const token = await registerUser("tpluser13", "tpl13@example.com")
  const app = await buildApp()

  const before = new Date().toISOString()
  const res = await app.fetch(
    new Request("http://localhost/api/platform/prompts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "Timestamps", content: "check timestamps" }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.template.createdAt).toBeDefined()
  expect(body.template.updatedAt).toBeDefined()
  expect(body.template.createdAt).toBe(body.template.updatedAt)
})
