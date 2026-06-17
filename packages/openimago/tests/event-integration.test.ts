/**
 * HTTP-level integration test for /api/event SSE endpoint.
 * Tests: register user → create session → SSE events arrive.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { db } from "../src/db/client"
import { users, userAuths } from "../src/db/schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { SessionTable } from "../src/db/session-schema"
import { setup, teardown, setupSessionTable, setupMessageTable } from "./helper"
import { createApp } from "../src/server/app"
import { signJwt } from "../src/auth/jwt"

let app: Hono

/** opencode upstream URL — same convention as health.test.ts / proxy.test.ts. */
const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096"

/**
 * Probe whether the live opencode upstream is reachable. The two tests below
 * depend on real upstream event timing (session.updated / auth.expired) and are
 * non-deterministic without it, so we skip them when no upstream is running.
 *
 * We probe the actual SSE endpoint the EventLayer connects to (/global/event)
 * with a short timeout: a healthy upstream answers 200 and opens the stream,
 * while a down/absent upstream yields a 5xx (e.g. 502) or a network error.
 */
async function upstreamReachable(): Promise<boolean> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 1500)
  try {
    const res = await fetch(`${OPENCODE_URL}/global/event`, {
      method: "GET",
      signal: ac.signal,
    })
    // Don't hold the long-lived SSE stream open.
    await res.body?.cancel()
    return res.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const UPSTREAM_AVAILABLE = await upstreamReachable()

beforeAll(async () => {
  await setup(); await setupSessionTable(); await setupMessageTable()
  app = createApp()
  // Wait for EventLayer to initialize (daemon fibers start + upstream connects)
  await new Promise((r) => setTimeout(r, 4000))
}, 30_000)

afterAll(async () => {
  await db.delete(SessionTable)
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
    // userId is already set on WorkspaceTable during registerUser → no manual mapping needed

    // Give EventLayer time to init
    await new Promise((r) => setTimeout(r, 6000))
    const events = await readSSE(reg.token, 5000)
    console.log("SSE events received:", events.length, events.map((e: any) => e.type))

    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events.map((e: any) => e.type)).toContain("server.connected")
  }, 15_000)

  test.skipIf(!UPSTREAM_AVAILABLE)("receives session.updated after creating a session", async () => {
    const reg = await registerUser("sse_sess")
    // userId is already set on WorkspaceTable during registerUser → no manual mapping needed

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

  test.skipIf(!UPSTREAM_AVAILABLE)("closes SSE stream with auth.expired when short-lived token expires", async () => {
    // Register a user via the normal flow to get a userId
    const reg = await registerUser("sse_auth_exp")
    // Generate a short-lived token (expires in 2 seconds) for the same user
    const shortToken = await signJwt({ userId: reg.user.id, role: reg.user.role }, "2s")

    // Wait briefly for EventLayer to register the user
    await new Promise((r) => setTimeout(r, 6000))

    // Connect to SSE with the short-lived token
    const events = await readSSE(shortToken, 12_000)
    console.log("SSE events for short-lived token:", events.length, events.map((e: any) => e.type))

    // Should receive server.connected first (token is still valid at connect time)
    expect(events.map((e: any) => e.type)).toContain("server.connected")

    // After the token expires (2s), the heartbeat should detect it and
    // send auth.expired before closing the stream.
    expect(events.map((e: any) => e.type)).toContain("auth.expired")
  }, 25_000)
})
