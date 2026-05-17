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

// 1. Register success
test("user can register with valid credentials", async () => {
  const res = await app.fetch(
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
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any> as Record<string, any>
  expect(body.user.username).toBe("alice")
  expect(body.user.email).toBe("alice@example.com")
  expect(body.token).toBeDefined()
  expect(typeof body.token).toBe("string")
})

// 2. Duplicate email
test("registration rejects duplicate email", async () => {
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "bob",
        email: "dupe@example.com",
        password: "password123",
      }),
    }),
  )
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "bob2",
        email: "dupe@example.com",
        password: "password123",
      }),
    }),
  )
  expect(res.status).toBe(409)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CONFLICT")
})

// 3. Weak password
test("registration rejects weak password", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "weak",
        email: "weak@example.com",
        password: "123",
      }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("VALIDATION_ERROR")
})

// 4. Login success
test("user can login with correct email/password", async () => {
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "loginuser",
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
  expect(body.user.username).toBe("loginuser")
  expect(body.user.email).toBe("login@example.com")
  expect(body.token).toBeDefined()
})

// 5. Login wrong password
test("login with wrong password returns 401", async () => {
  await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "user5",
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

// 6. Login unregistered email
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

// 10. GET /auth/me success
test("GET /auth/me returns user info for valid token", async () => {
  const reg = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "meuser",
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
  expect(body.username).toBe("meuser")
  expect(body.email).toBe("me@example.com")
  expect(body.role).toBe("user")
})

// 11. GET /auth/me without token
test("GET /auth/me without token returns 401", async () => {
  const res = await app.fetch(
    new Request("http://localhost/auth/me"),
  )
  expect(res.status).toBe(401)
})
