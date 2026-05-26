/**
 * HTTP-level integration test for /api/event SSE endpoint.
 * Tests: register user → create session → SSE events arrive.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { db } from "../src/db/client"
import { workspaceRefs, users, userAuths } from "../src/db/schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { SessionTable } from "../src/db/session-schema"
import { setup, teardown, setupSessionTable, setupMessageTable } from "./helper"
import { createApp } from "../src/server/app"

let app: Hono

beforeAll(async () => {
  await setup(); await setupSessionTable(); await setupMessageTable()
  app = createApp()
  // Wait for EventLayer to initialize (daemon fibers start + upstream connects)
  await new Promise((r) => setTimeout(r, 4000))
}, 30_000)

afterAll(async () => {
  await db.delete(SessionTable); await db.delete(workspaceRefs)
  await db.delete(userAuths); await db.delete(users); await db.delete(WorkspaceTable)
  await teardown()
}, 10_000)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registerUser(u: string): Promise<any> {
  const r = await app.fetch(new Request("http://localhost/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, email: `${u}@t.com`, password: "password123" }),
  }))
  return r.json()
}

async function createSession(token: string) {
  const r = await app.fetch(new Request("http://localhost/api/session", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  }))
  return r.status === 201 ? r.json() : null
}

/** Read SSE events from /api/event for given token, return parsed events */
async function readSSE(token: string, timeoutMs: number): Promise<Record<string, unknown>[]> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const res = await app.fetch(new Request("http://localhost/api/event", {
      headers: { authorization: `Bearer ${token}` },
      signal: abort.signal,
    }))
    if (res.status !== 200) return []
    if (!res.body) return []

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const events: Record<string, unknown>[] = []
    let currentData: string[] = []

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line
          if (cleanLine === "") {
            if (currentData.length > 0) {
              try { events.push(JSON.parse(currentData.join("\n"))) } catch { /* skip */ }
              currentData = []
            }
            continue
          }
          const idx = cleanLine.indexOf(":")
          const field = idx === -1 ? cleanLine : cleanLine.slice(0, idx)
          const val = idx === -1 ? "" : cleanLine.slice(idx + (cleanLine[idx + 1] === " " ? 2 : 1))
          if (field === "data") currentData.push(val)
        }
      }
    } catch { /* reader closed */ }

    // Flush remaining
    if (currentData.length > 0) {
      try { events.push(JSON.parse(currentData.join("\n"))) } catch { /* skip */ }
    }
    return events
  } finally {
    clearTimeout(timer)
  }
}

describe("/api/event SSE endpoint", () => {
  test("receives server.connected event on connection", async () => {
    const reg = await registerUser("sse_conn")
    await db.insert(workspaceRefs).values({ workspaceId: reg.user.workspaceId, userId: reg.user.id }).onConflictDoNothing()

    // Give EventLayer time to init
    await new Promise((r) => setTimeout(r, 6000))
    const events = await readSSE(reg.token, 5000)
    console.log("SSE events received:", events.length, events.map((e: any) => e.type))

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.map((e: any) => e.type)).toContain("server.connected")
  }, 15_000)

  test("receives session.updated after creating a session", async () => {
    const reg = await registerUser("sse_sess")
    await db.insert(workspaceRefs).values({ workspaceId: reg.user.workspaceId, userId: reg.user.id }).onConflictDoNothing()

    // Connect to SSE
    const abort = new AbortController()
    const ssePromise = app.fetch(new Request("http://localhost/api/event", {
      headers: { authorization: `Bearer ${reg.token}` },
      signal: abort.signal,
    }))

    // Wait for connection
    await new Promise((r) => setTimeout(r, 1000))

    // Create session — this triggers events in opencode
    const session = await createSession(reg.token)
    console.log("Session created:", !!session)

    // Read SSE
    const res = await ssePromise
    if (!res.body) { console.log("No body"); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const events: Record<string, unknown>[] = []
    let currentData: string[] = []

    const timeout = setTimeout(() => { reader.cancel(); abort.abort() }, 10_000)

    try {
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { done, value } = await reader.read() as any
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line
          if (cleanLine === "") {
            if (currentData.length > 0) {
              try { events.push(JSON.parse(currentData.join("\n"))) } catch { /* skip */ }
              currentData = []
            }
            continue
          }
          const idx = cleanLine.indexOf(":")
          const field = idx === -1 ? cleanLine : cleanLine.slice(0, idx)
          const val = idx === -1 ? "" : cleanLine.slice(idx + (cleanLine[idx + 1] === " " ? 2 : 1))
          if (field === "data") currentData.push(val)
        }
        if (events.length >= 3) break
      }
    } catch { /* done */ }
    clearTimeout(timeout)
    abort.abort()

    console.log("SSE events:", events.length, events.map((e: any) => e.type))
    const types = events.map((e: any) => e.type)
    expect(types).toContain("server.connected")
    expect(types).toContain("session.updated")
    // heartbeat may or may not arrive within test timeout — optional
    if (types.includes("server.heartbeat")) {
      console.log("heartbeat also received")
    }
  }, 20_000)
})
