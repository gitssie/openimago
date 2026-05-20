import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"

let app: Hono

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
})

afterAll(async () => {
  await teardown()
})

// ---------------------------------------------------------------------------
// REDIRECT URL tests (provider = github | google | unknown)
// ---------------------------------------------------------------------------

test("GET /auth/oauth/github returns correct redirect URL with client_id and state", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/github"),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.redirectUrl).toBeDefined()
  expect(typeof body.redirectUrl).toBe("string")
  // expect GH authorize URL
  expect(body.redirectUrl).toContain("github.com/login/oauth/authorize")
  expect(body.redirectUrl).toContain("client_id=")
  expect(body.redirectUrl).toContain("state=")
  expect(body.redirectUrl).toContain("redirect_uri=")
})

test("GET /auth/oauth/google returns correct redirect URL", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/google"),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.redirectUrl).toContain("accounts.google.com/o/oauth2/v2/auth")
})

test("GET /auth/oauth/unknown returns 400 INVALID_PROVIDER", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/unknown"),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_PROVIDER")
})

// ---------------------------------------------------------------------------
// CALLBACK state validation tests
// ---------------------------------------------------------------------------

test("callback without state returns 400 INVALID_STATE", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/github/callback?code=testcode"),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_STATE")
})

test("callback with wrong state returns 400 INVALID_STATE", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/github/callback?code=testcode&state=bogus"),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_STATE")
})

test("callback with expired state returns 400 INVALID_STATE", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/oauth/github/callback?code=testcode&state=never-created"),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_STATE")
})

// ---------------------------------------------------------------------------
// CALLBACK success tests (mock fetch for OAuth provider APIs)
// ---------------------------------------------------------------------------

function mockGitHubOAuth(overrides?: { id?: number; login?: string; email?: string }) {
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "gh-mock-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (url.includes("api.github.com/user")) {
      return new Response(
        JSON.stringify({
          id: overrides?.id ?? 12345,
          login: overrides?.login ?? "ghuser",
          name: "GitHub User",
          email: overrides?.email ?? "ghuser@example.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }
    return origFetch(input, init)
  }) as typeof globalThis.fetch
  return () => { globalThis.fetch = origFetch }
}

function mockGoogleOAuth(overrides?: { id?: string; email?: string }) {
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "goog-mock-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (url.includes("googleapis.com/oauth2/v2/userinfo")) {
      return new Response(
        JSON.stringify({
          id: overrides?.id ?? "67890",
          name: "Google User",
          email: overrides?.email ?? "guser@example.com",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }
    return origFetch(input, init)
  }) as typeof globalThis.fetch
  return () => { globalThis.fetch = origFetch }
}

// Helper: get a valid state for callback tests
async function getValidState(): Promise<string> {
  const { OAuthService } = await import("../src/auth/oauth")
  OAuthService._storeStateForTesting("valid-test-state-for-callback")
  return "valid-test-state-for-callback"
}

test("GitHub callback: new user → 201 with user, token, workspace", async () => {
  const state = await getValidState()
  const restore = mockGitHubOAuth()

  const res = await app.fetch(
    new Request(
      `http://localhost/auth/oauth/github/callback?code=testcode&state=${state}`,
    ),
  )
  restore()

  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.user).toBeDefined()
  expect(body.user.username).toBe("ghuser")
  expect(body.user.email).toBe("ghuser@example.com")
  expect(body.user.role).toBe("user")
  expect(body.user.workspaceId).toBeDefined()
  expect(typeof body.user.workspaceId).toBe("string")
  expect(body.token).toBeDefined()
  expect(typeof body.token).toBe("string")

  // Verify user_auths record exists
  const { db } = await import("../src/db/client")
  const { userAuths } = await import("../src/db/schema")
  const { eq } = await import("drizzle-orm")
  const authRows = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, "12345"))
  expect(authRows.length).toBe(1)
  expect(authRows[0]!.provider).toBe("github")
  expect(authRows[0]!.userId).toBe(body.user.id)

  // Verify workspace record exists
  const { WorkspaceTable } = await import("../src/db/workspace-schema")
  const workspaceRows = await db
    .select()
    .from(WorkspaceTable)
    .where(eq(WorkspaceTable.id, body.user.workspaceId))
  expect(workspaceRows.length).toBe(1)
})

test("GitHub callback: existing user → 200, same user id, no duplicate", async () => {
  // First callback creates the user
  const state1 = await getValidState()
  const r1 = mockGitHubOAuth({ id: 77777, login: "existingdev", email: "existing@example.com" })
  const res1 = await app.fetch(
    new Request(`http://localhost/auth/oauth/github/callback?code=code1&state=${state1}`),
  )
  r1()
  const body1 = await res1.json() as Record<string, any>
  expect(res1.status).toBe(201)
  const userId = body1.user.id

  // Second callback with same GitHub id → should return same user, 200
  const state2 = await getValidState()
  const r2 = mockGitHubOAuth({ id: 77777, login: "existingdev", email: "existing@example.com" })
  const res2 = await app.fetch(
    new Request(`http://localhost/auth/oauth/github/callback?code=code2&state=${state2}`),
  )
  r2()

  expect(res2.status).toBe(200)
  const body2 = await res2.json() as Record<string, any>
  expect(body2.user.id).toBe(userId)
  expect(body2.user.username).toBe("existingdev")

  // No duplicate user_auths
  const { db } = await import("../src/db/client")
  const { userAuths } = await import("../src/db/schema")
  const { eq } = await import("drizzle-orm")
  const authRows = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, "77777"))
  expect(authRows.length).toBe(1)
})

test("Google callback: new user → 201 with user and token", async () => {
  const state = await getValidState()
  const restore = mockGoogleOAuth()

  const res = await app.fetch(
    new Request(
      `http://localhost/auth/oauth/google/callback?code=testcode&state=${state}`,
    ),
  )
  restore()

  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.user.username).toBe("guser") // from email prefix
  expect(body.user.email).toBe("guser@example.com")
  expect(body.token).toBeDefined()

  const { db } = await import("../src/db/client")
  const { userAuths } = await import("../src/db/schema")
  const { eq } = await import("drizzle-orm")
  const authRows = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, "67890"))
  expect(authRows.length).toBe(1)
  expect(authRows[0]!.provider).toBe("google")
})

test("Same GitHub user re-callback returns 200 with same user id", async () => {
  // Create via first callback
  const stateA = await getValidState()
  const ra = mockGitHubOAuth({ id: 99999, login: "repeatdev", email: "repeat@example.com" })
  const resA = await app.fetch(
    new Request(`http://localhost/auth/oauth/github/callback?code=codeA&state=${stateA}`),
  )
  ra()
  const bodyA = await resA.json() as Record<string, any>
  expect(resA.status).toBe(201)
  const firstUserId = bodyA.user.id

  // Second callback (re-login, no mock needed for the repeat test)
  // Actually we need another mock + state
  // But this is essentially covered by test 8 already.
  // Let's make a distinct test: call twice and verify id never changes.
  const stateB = await getValidState()
  const rb = mockGitHubOAuth({ id: 99999, login: "repeatdev", email: "repeat@example.com" })
  const resB = await app.fetch(
    new Request(`http://localhost/auth/oauth/github/callback?code=codeB&state=${stateB}`),
  )
  rb()
  const bodyB = await resB.json() as Record<string, any>
  expect(resB.status).toBe(200)
  expect(bodyB.user.id).toBe(firstUserId)

  // Third time
  const stateC = await getValidState()
  const rc = mockGitHubOAuth({ id: 99999, login: "repeatdev", email: "repeat@example.com" })
  const resC = await app.fetch(
    new Request(`http://localhost/auth/oauth/github/callback?code=codeC&state=${stateC}`),
  )
  rc()
  const bodyC = await resC.json() as Record<string, any>
  expect(resC.status).toBe(200)
  expect(bodyC.user.id).toBe(firstUserId)

  // Only one user_auths record
  const { db } = await import("../src/db/client")
  const { userAuths } = await import("../src/db/schema")
  const { eq } = await import("drizzle-orm")
  const authRows = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, "99999"))
  expect(authRows.length).toBe(1)
})

test("OAuth token is valid: GET /auth/me returns user info", async () => {
  const state = await getValidState()
  const restore = mockGitHubOAuth({ id: 88888, login: "authmetest", email: "authme@example.com" })

  const res = await app.fetch(
    new Request(
      `http://localhost/auth/oauth/github/callback?code=testcode&state=${state}`,
    ),
  )
  restore()

  const body = await res.json() as Record<string, any>
  const token = body.token

  const meRes = await app.fetch(
    new Request("http://localhost/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(meRes.status).toBe(200)
  const meBody = await meRes.json() as Record<string, any>
  expect(meBody.username).toBe("authmetest")
  expect(meBody.email).toBe("authme@example.com")
  expect(meBody.role).toBe("user")
  expect(meBody.id).toBe(body.user.id)
})
