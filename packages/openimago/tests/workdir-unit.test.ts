/**
 * WorkDirService unit tests with injected FileSystem.
 *
 * These tests verify createSessionDir behavior without touching /mnt/cos.
 * The FileSystem interface is injected so directory creation can be stubbed.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { WorkDirService } from "../src/workdir/service"
import { authRoutes } from "../src/auth/routes"

const FAKE_FS_BASE = "/fake/cos"

let app: Hono
let userId: string

async function registerUser() {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "unit_wdir", email: "unit_wdir@example.com", password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.user.id as string
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  userId = await registerUser()
}, 20000)

afterAll(async () => {
  await teardown()
})

describe("WorkDirService with injected FileSystem", () => {
  test("createSessionDir without projectId calls mkdir once and returns dir record", async () => {
    const mkdirCalls: string[] = []
    const fakeFs = { mkdir: async (path: string) => { mkdirCalls.push(path) } }

    const svc = new WorkDirService(FAKE_FS_BASE, fakeFs)
    const result = await svc.createSessionDir({ userId })

    expect("error" in result).toBe(false)
    if ("error" in result) return

    expect(result.directory).toMatch(new RegExp(`^${FAKE_FS_BASE}/[a-z0-9]+$`))
    expect(result.status).toBe(201)

    // mkdir was called exactly once with the correct path
    expect(mkdirCalls).toHaveLength(1)
    expect(mkdirCalls[0]).toBe(result.directory)
  })

  test("createSessionDir with missing projectId returns 404 — no mkdir called", async () => {
    const mkdirCalls: string[] = []
    const fakeFs = { mkdir: async (path: string) => { mkdirCalls.push(path) } }
    const svc = new WorkDirService(FAKE_FS_BASE, fakeFs)
    const result = await svc.createSessionDir({ userId, projectId: "proj_nonexistent" })

    if (!("error" in result)) return
    expect(result.status).toBe(404)
    expect((result as any).error.code).toBe("NOT_FOUND")
    // mkdir should never be called when project lookup fails
    expect(mkdirCalls).toHaveLength(0)
  })
})
