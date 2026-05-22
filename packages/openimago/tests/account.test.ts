import { describe, test, expect, beforeAll, afterAll } from "bun:test"
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

// Helper: register a user and return { user, token }
async function registerUser(username: string, email: string, password = "password123") {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    }),
  )
  expect(res.status).toBe(201)
  return res.json() as Promise<Record<string, any>>
}

// Helper: PATCH /auth/me
async function patchMe(token: string, body: Record<string, any>) {
  return app.fetch(
    new Request("http://localhost/auth/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  )
}

// ---------------------------------------------------------------------------
// 1. Update displayName
// ---------------------------------------------------------------------------
test("PATCH /auth/me updates displayName", async () => {
  const { token } = await registerUser("acctuser1", "acct1@example.com")
  const res = await patchMe(token, { displayName: "Account One" })
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.user.displayName).toBe("Account One")
})

// ---------------------------------------------------------------------------
// 2. Update email
// ---------------------------------------------------------------------------
test("PATCH /auth/me updates email", async () => {
  const { token } = await registerUser("acctuser2", "acct2@example.com")
  const res = await patchMe(token, { email: "acct2-new@example.com" })
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.user.email).toBe("acct2-new@example.com")
})

// ---------------------------------------------------------------------------
// 3. Email conflict → 409
// ---------------------------------------------------------------------------
test("PATCH /auth/me rejects duplicate email", async () => {
  await registerUser("acctuser3a", "acct3a@example.com")
  const { token } = await registerUser("acctuser3b", "acct3b@example.com")

  const res = await patchMe(token, { email: "acct3a@example.com" })
  expect(res.status).toBe(409)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

// ---------------------------------------------------------------------------
// 4. Update password (correct currentPassword)
// ---------------------------------------------------------------------------
test("PATCH /auth/me updates password with correct currentPassword", async () => {
  const { token, user } = await registerUser("acctuser4", "acct4@example.com", "oldpassword")

  const res = await patchMe(token, {
    currentPassword: "oldpassword",
    newPassword: "newsecurepw",
  })
  expect(res.status).toBe(200)

  // Old password should no longer work
  const loginOld = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "acct4@example.com", password: "oldpassword" }),
    }),
  )
  expect(loginOld.status).toBe(401)

  // New password should work
  const loginNew = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "acct4@example.com", password: "newsecurepw" }),
    }),
  )
  expect(loginNew.status).toBe(200)
})

// ---------------------------------------------------------------------------
// 5. Wrong currentPassword → 401
// ---------------------------------------------------------------------------
test("PATCH /auth/me rejects wrong currentPassword", async () => {
  const { token } = await registerUser("acctuser5", "acct5@example.com", "correctpw")

  const res = await patchMe(token, {
    currentPassword: "wrongpw",
    newPassword: "newsecurepw",
  })
  expect(res.status).toBe(401)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("WRONG_PASSWORD")
})

// ---------------------------------------------------------------------------
// 6. newPassword < 8 chars → 400
// ---------------------------------------------------------------------------
test("PATCH /auth/me rejects short newPassword", async () => {
  const { token } = await registerUser("acctuser6", "acct6@example.com", "correctpw")

  const res = await patchMe(token, {
    currentPassword: "correctpw",
    newPassword: "short",
  })
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ---------------------------------------------------------------------------
// 7. No token → 401
// ---------------------------------------------------------------------------
test("PATCH /auth/me without token returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Hacker" }),
    }),
  )
  expect(res.status).toBe(401)
})

// ---------------------------------------------------------------------------
// 8. After update, GET /auth/me returns updated info
// ---------------------------------------------------------------------------
test("GET /auth/me reflects updated profile", async () => {
  const { token } = await registerUser("acctuser8", "acct8@example.com")

  await patchMe(token, { displayName: "Updated Name", email: "acct8-new@example.com" })

  const meRes = await app.fetch(
    new Request("http://localhost/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(meRes.status).toBe(200)
  const meBody = await meRes.json() as Record<string, any>
  expect(meBody.displayName).toBe("Updated Name")
  expect(meBody.email).toBe("acct8-new@example.com")
})

// ---------------------------------------------------------------------------
// 9. OAuth user sets password for first time
// ---------------------------------------------------------------------------
test("OAuth user can set password for first time", async () => {
  const { OAuthService } = await import("../src/auth/oauth")
  OAuthService._storeStateForTesting("oauth-pw-state-1")

  // Mock GitHub OAuth
  const origFetch = globalThis.fetch
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("github.com/login/oauth/access_token")) {
      return new Response(JSON.stringify({ access_token: "gh-token-pw" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      })
    }
    if (url.includes("api.github.com/user")) {
      return new Response(
        JSON.stringify({ id: 11111, login: "oauthpwuser", name: "OAuth PW", email: "oauthpw@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }
    return origFetch(input, init)
  }) as typeof globalThis.fetch

  const cbRes = await app.fetch(
    new Request("http://localhost/auth/oauth/github/callback?code=code&state=oauth-pw-state-1"),
  )
  globalThis.fetch = origFetch

  expect(cbRes.status).toBe(201)
  const { token } = await cbRes.json() as Record<string, any>

  // Now set a password
  const res = await patchMe(token, {
    newPassword: "oauthpassword123",
  })
  expect(res.status).toBe(200)

  // Verify user_auths has password provider record
  const { db } = await import("../src/db/client")
  const { userAuths } = await import("../src/db/schema")
  const { eq, and } = await import("drizzle-orm")
  const authRows = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, "11111"))
  expect(authRows.length).toBe(1)
  expect(authRows[0]!.provider).toBe("github")

  // Now check that a password provider record also exists
  const pwRows = await db
    .select()
    .from(userAuths)
    .where(
      and(
        eq(userAuths.userId, authRows[0]!.userId),
        eq(userAuths.provider, "password"),
      ),
    )
  expect(pwRows.length).toBe(1)
  expect(pwRows[0]!.passwordHash).toBeDefined()

  // Login with the new password should work
  const loginRes = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "oauthpw@example.com", password: "oauthpassword123" }),
    }),
  )
  expect(loginRes.status).toBe(200)
})
