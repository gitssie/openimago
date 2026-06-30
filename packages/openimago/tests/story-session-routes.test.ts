import { test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setup, teardown, setupSessionTable } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { storyRoutes, storySessionRoutes } from "../src/project/story-routes"
import { SessionTable } from "../src/db/session-schema"
import { db } from "../src/db/client"

// ADR 0009 — Story is directory-scoped. A standalone session resolves to its
// directory + ownership exactly like a project, so the SAME story handlers are
// reachable under /api/platform/sessions/:id/story/*. These tests pin that the
// generalized resolver picks the right directory for a session key and enforces
// workspace ownership (FORBIDDEN) / existence (NOT_FOUND).

let app: Hono

interface Registration {
  token: string
  workspaceId: string
}

async function registerUser(email: string): Promise<Registration> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  return { token: body.token as string, workspaceId: body.user.workspaceId as string }
}

/** Create a session directory with a scaffolded story/bible.json, returning the dir. */
async function scaffoldSessionDir(title: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "story-session-"))
  await mkdir(join(dir, "story"), { recursive: true })
  await writeFile(
    join(dir, "story", "bible.json"),
    JSON.stringify({ schemaVersion: 1, projectId: "n/a", title }),
    "utf-8",
  )
  return dir
}

/** Upsert a session row with the given workspace_id + directory. */
async function ensureSession(id: string, workspaceId: string, directory: string) {
  await db
    .insert(SessionTable)
    .values({
      id,
      project_id: "global",
      workspace_id: workspaceId,
      slug: "story-session-test",
      directory,
      title: "Story Session Test",
      version: "0",
      time_created: Date.now(),
      time_updated: Date.now(),
    })
    .onConflictDoUpdate({
      target: SessionTable.id,
      set: { workspace_id: workspaceId, directory },
    })
}

function authHeaders(token: string): Record<string, string> {
  return { "content-type": "application/json", authorization: `Bearer ${token}` }
}

beforeAll(async () => {
  await setup()
  await setupSessionTable()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", storyRoutes)
  app.route("/api/platform/sessions", storySessionRoutes)
})

afterAll(async () => {
  await teardown()
})

test("session-mounted story GET resolves to the session's directory", async () => {
  const { token, workspaceId } = await registerUser("ss-ok@example.com")
  const dir = await scaffoldSessionDir("Session Bible")
  const sessionId = "ses_story_ok_001"
  await ensureSession(sessionId, workspaceId, dir)

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/story/bible`, {
      headers: authHeaders(token),
    }),
  )

  expect(res.status).toBe(200)
  const body = (await res.json()) as Record<string, any>
  expect(body.bible.title).toBe("Session Bible")
})

test("session story GET is FORBIDDEN when the caller's workspace does not own the session", async () => {
  const owner = await registerUser("ss-owner@example.com")
  const intruder = await registerUser("ss-intruder@example.com")
  const dir = await scaffoldSessionDir("Owner Bible")
  const sessionId = "ses_story_forbidden_001"
  await ensureSession(sessionId, owner.workspaceId, dir)

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/${sessionId}/story/bible`, {
      headers: authHeaders(intruder.token),
    }),
  )

  expect(res.status).toBe(403)
})

test("session story GET is NOT_FOUND for a missing session key", async () => {
  const { token } = await registerUser("ss-missing@example.com")

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/sessions/ses_does_not_exist/story/bible`, {
      headers: authHeaders(token),
    }),
  )

  expect(res.status).toBe(404)
})
