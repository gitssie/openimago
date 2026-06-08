import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { verificationStore } from "../src/auth/email-verification"

let app: Hono

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
})

afterAll(async () => {
  await teardown()
})

/** Helper: request a verification code for an email and return the code. */
async function requestVerificationCode(email: string): Promise<string> {
  const res = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  expect(res.status).toBe(200)
  const code = verificationStore.getCode(email)
  if (!code) throw new Error(`No verification code found for ${email}`)
  return code
}

// ── Email verification ────────────────────────────────────────────────

// 1. Send verification code
test("POST /auth/email-verification/send returns success", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test1@example.com" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.success).toBe(true)
})

// 2. Send verification rejects invalid email
test("POST /auth/email-verification/send rejects invalid email", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// 3. Send verification rejects already registered email
test("POST /auth/email-verification/send rejects already registered email", async () => {
  // Register alice first
  const code = await requestVerificationCode("alice@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )

  // Try to send code again for same email
  const res = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    }),
  )
  expect(res.status).toBe(409)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

// 4. Resend cooldown is enforced
test("POST /auth/email-verification/send enforces cooldown", async () => {
  const email = "cooldown@example.com"
  const res1 = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  expect(res1.status).toBe(200)

  // Immediate resend should be rate-limited
  const res2 = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  expect(res2.status).toBe(429)
  const body = await res2.json() as Record<string, any>
  expect(body.error.code).toBe("RATE_LIMITED")
})

// ── Registration with verification ────────────────────────────────────

// 5. Registration without verification code is rejected
test("registration without verification code is rejected", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "nocode",
        email: "nocode@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// 6. Registration with wrong verification code is rejected
test("registration with wrong verification code is rejected", async () => {
  await requestVerificationCode("wrongcode@example.com")
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "wrongcode",
        email: "wrongcode@example.com",
        password: "password123",
        verificationCode: "000000",
      }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_VERIFICATION_CODE")
})

// 7. Registration with correct verification code succeeds
test("user can register with verified email", async () => {
  const code = await requestVerificationCode("bob@example.com")
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "bob",
        email: "bob@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.user.username).toBe("bob")
  expect(body.user.email).toBe("bob@example.com")
  expect(body.token).toBeDefined()
  expect(typeof body.token).toBe("string")
})

// 8. Verification code is consumed — cannot be reused
test("verification code is consumed after successful registration", async () => {
  const code = await requestVerificationCode("onetime@example.com")
  // First registration succeeds
  const res1 = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "onetime",
        email: "onetime@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  expect(res1.status).toBe(201)

  // Second registration with same email should fail (email already registered)
  const code2 = verificationStore.getCode("onetime@example.com")
  expect(code2).toBeUndefined()
})

// 9. Duplicate email still rejected
test("registration rejects duplicate email", async () => {
  const code = await requestVerificationCode("dupe@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "dupe1",
        email: "dupe@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )

  // Manually inject a new verification code for the already-registered email
  // (bypassing the send endpoint's duplicate-email check)
  verificationStore.storeCode("dupe@example.com", "999999")

  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "dupe2",
        email: "dupe@example.com",
        password: "password123",
        verificationCode: "999999",
      }),
    }),
  )
  expect(res.status).toBe(409)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

// 10. Weak password still rejected
test("registration rejects weak password", async () => {
  const code = await requestVerificationCode("weak@example.com")
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "weak",
        email: "weak@example.com",
        password: "123",
        verificationCode: code,
      }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ── Login (unchanged, uses verified registrations) ────────────────────

// 11. Login success
test("user can login with correct email/password", async () => {
  const code = await requestVerificationCode("login@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "loginuser",
        email: "login@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  const res = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "login@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.user.username).toBe("loginuser")
  expect(body.user.email).toBe("login@example.com")
  expect(body.token).toBeDefined()
})

// 12. Login wrong password
test("login with wrong password returns 401", async () => {
  const code = await requestVerificationCode("wrongpw@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "user12",
        email: "wrongpw@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  const res = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "wrongpw@example.com",
        password: "wrongpassword",
      }),
    }),
  )
  expect(res.status).toBe(401)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_CREDENTIALS")
})

// 13. Login unregistered email
test("login with unregistered email returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(401)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("INVALID_CREDENTIALS")
})

// 14. GET /auth/me success
test("GET /auth/me returns user info for valid token", async () => {
  const code = await requestVerificationCode("me@example.com")
  const reg = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "meuser",
        email: "me@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  const { token } = await reg.json() as Record<string, any>
  const res = await app.fetch(
    new Request("http://localhost/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.username).toBe("meuser")
  expect(body.email).toBe("me@example.com")
  expect(body.role).toBe("user")
})

// 15. GET /auth/me without token
test("GET /auth/me without token returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/me"),
  )
  expect(res.status).toBe(401)
})
