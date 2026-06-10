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

// 3. Send verification rejects already verified registered email
test("POST /auth/email-verification/send rejects already verified registered email", async () => {
  // Register alice first, then verify her email
  await requestVerificationCode("alice@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        email: "alice@example.com",
        password: "password123",
      }),
    }),
  )
  const { token } = await (await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "password123" }),
    }),
  )).json() as { token: string }
  const verifyCode = verificationStore.getCode("alice@example.com")
  expect(verifyCode).toBeDefined()
  await app.fetch(
    new Request("http://localhost/auth/email-verification/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: verifyCode }),
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

// ── Registration with deferred verification ────────────────────────────

// 5. Registration with only email/password creates an unverified user and generated username
test("registration with only email/password creates an unverified user", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "nocode@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as { token: string; user: { username: string; email: string; emailVerified: boolean; emailVerifiedAt: string | null } }
  expect(body.user.username).toMatch(/^usr_/)
  expect(body.user.email).toBe("nocode@example.com")
  expect(body.user.emailVerified).toBe(false)
  expect(body.user.emailVerifiedAt).toBeNull()
  expect(typeof body.token).toBe("string")
})

// 6. Registration ignores stale/wrong verification code and still creates an unverified user
test("registration ignores stale verification code and creates an unverified user", async () => {
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
  expect(res.status).toBe(201)
  const body = await res.json() as { user: { emailVerified: boolean } }
  expect(body.user.emailVerified).toBe(false)
})

// 7. Registration with correct verification code still defers verification until login-time flow
test("user can register with deferred email verification", async () => {
  const code = await requestVerificationCode("bob@example.com")
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "bob@example.com",
        password: "password123",
        verificationCode: code,
      }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.user.username).toMatch(/^usr_/)
  expect(body.user.email).toBe("bob@example.com")
  expect(body.user.emailVerified).toBe(false)
  expect(body.token).toBeDefined()
  expect(typeof body.token).toBe("string")
})

// 8. Verification code is consumed — cannot be reused
test("verification code is consumed after successful registration", async () => {
  await requestVerificationCode("onetime@example.com")
  // First registration succeeds without consuming the login-time verification code
  const res1 = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "onetime@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res1.status).toBe(201)

  // Existing pre-registration code remains available until a login-time verification consumes it.
  const code2 = verificationStore.getCode("onetime@example.com")
  expect(code2).toBeDefined()
})

// 9. Verified duplicate email still rejected
test("registration rejects duplicate verified email", async () => {
  await requestVerificationCode("dupe@example.com")
  const firstRegister = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "dupe@example.com",
        password: "password123",
      }),
    }),
  )
  const { token } = await firstRegister.json() as { token: string }
  const code = verificationStore.getCode("dupe@example.com")
  expect(code).toBeDefined()
  const verify = await app.fetch(
    new Request("http://localhost/auth/email-verification/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    }),
  )
  expect(verify.status).toBe(200)

  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "dupe@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(409)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

test("unverified email registration can be reclaimed with a new password and code", async () => {
  const attackerCode = await requestVerificationCode("reclaim@example.com")
  const attackerRegister = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reclaim@example.com",
        password: "attacker-pass",
      }),
    }),
  )
  expect(attackerRegister.status).toBe(201)
  const attackerBody = await attackerRegister.json() as { token: string; user: { id: string } }

  const victimRegister = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reclaim@example.com",
        password: "victim-pass",
      }),
    }),
  )
  expect(victimRegister.status).toBe(201)
  const victimBody = await victimRegister.json() as { token: string; user: { id: string; emailVerified: boolean } }
  expect(victimBody.user.id).not.toBe(attackerBody.user.id)
  expect(victimBody.user.emailVerified).toBe(false)

  const replacementCode = verificationStore.getCode("reclaim@example.com")
  expect(replacementCode).toBeDefined()
  expect(replacementCode).not.toBe(attackerCode)

  const staleVerify = await app.fetch(
    new Request("http://localhost/auth/email-verification/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${victimBody.token}` },
      body: JSON.stringify({ code: attackerCode }),
    }),
  )
  expect(staleVerify.status).toBe(400)
  const staleBody = await staleVerify.json() as Record<string, any>
  expect(staleBody.error.code).toBe("INVALID_VERIFICATION_CODE")

  const verified = await app.fetch(
    new Request("http://localhost/auth/email-verification/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${victimBody.token}` },
      body: JSON.stringify({ code: replacementCode }),
    }),
  )
  expect(verified.status).toBe(200)

  const oldPasswordLogin = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reclaim@example.com", password: "attacker-pass" }),
    }),
  )
  expect(oldPasswordLogin.status).toBe(401)

  const newPasswordLogin = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "reclaim@example.com", password: "victim-pass" }),
    }),
  )
  expect(newPasswordLogin.status).toBe(200)
  const newPasswordBody = await newPasswordLogin.json() as { requiresEmailVerification: boolean; user: { emailVerified: boolean } }
  expect(newPasswordBody.requiresEmailVerification).toBe(false)
  expect(newPasswordBody.user.emailVerified).toBe(true)
})

// 10. Weak password still rejected
test("registration rejects weak password", async () => {
  await requestVerificationCode("weak@example.com")
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "weak@example.com",
        password: "123",
      }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// ── Login + login-time email verification ─────────────────────────────

// 11. Login success
test("user can login with correct email/password", async () => {
  await requestVerificationCode("login@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "login@example.com",
        password: "password123",
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
  expect(body.user.username).toMatch(/^usr_/)
  expect(body.user.email).toBe("login@example.com")
  expect(body.user.emailVerified).toBe(false)
  expect(body.requiresEmailVerification).toBe(true)
  expect(body.token).toBeDefined()
})

test("authenticated unverified user can request a new verification code", async () => {
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "resend-login@example.com",
        password: "password123",
      }),
    }),
  )
  const login = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "resend-login@example.com", password: "password123" }),
    }),
  )
  const { token } = await login.json() as { token: string }

  const res = await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "resend-login@example.com" }),
    }),
  )

  expect(res.status).toBe(200)
  expect(verificationStore.getCode("resend-login@example.com")).toBeDefined()
})

test("verifying login-time code marks existing user email verified", async () => {
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "verify-login@example.com",
        password: "password123",
      }),
    }),
  )
  const login = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "verify-login@example.com", password: "password123" }),
    }),
  )
  const { token } = await login.json() as { token: string }
  await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: "verify-login@example.com" }),
    }),
  )
  const code = verificationStore.getCode("verify-login@example.com")
  expect(code).toBeDefined()

  const verify = await app.fetch(
    new Request("http://localhost/auth/email-verification/verify", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    }),
  )

  expect(verify.status).toBe(200)
  const verifiedBody = await verify.json() as { user: { emailVerified: boolean; emailVerifiedAt: string | null } }
  expect(verifiedBody.user.emailVerified).toBe(true)
  expect(verifiedBody.user.emailVerifiedAt).not.toBeNull()

  const verifiedLogin = await app.fetch(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "verify-login@example.com", password: "password123" }),
    }),
  )
  const verifiedLoginBody = await verifiedLogin.json() as { requiresEmailVerification: boolean; user: { emailVerified: boolean } }
  expect(verifiedLoginBody.requiresEmailVerification).toBe(false)
  expect(verifiedLoginBody.user.emailVerified).toBe(true)
})

// 12. Login wrong password
test("login with wrong password returns 401", async () => {
  await requestVerificationCode("wrongpw@example.com")
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "wrongpw@example.com",
        password: "password123",
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
  await requestVerificationCode("me@example.com")
  const reg = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "me@example.com",
        password: "password123",
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
  expect(body.username).toMatch(/^usr_/)
  expect(body.email).toBe("me@example.com")
  expect(body.role).toBe("user")
  expect(body.emailVerified).toBe(false)
})

// 15. GET /auth/me without token
test("GET /auth/me without token returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/me"),
  )
  expect(res.status).toBe(401)
})
