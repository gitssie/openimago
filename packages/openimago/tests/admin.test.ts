import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { eq } from "drizzle-orm"
import { setup, teardown } from "./helper"
import { signJwt } from "../src/auth/jwt"
import { userId } from "../src/utils/ids"
import { db } from "../src/db/client"
import { users } from "../src/db/schema"

let app: Hono

beforeAll(async () => {
  await setup()
  // We'll rebuild the app in each test import since we need dynamic import
})

afterAll(async () => {
  await teardown()
})

async function buildAppWithAdminRoutes(): Promise<Hono> {
  const { authMiddleware, adminMiddleware } = await import("../src/server/middleware")
  const { adminRoutes } = await import("../src/admin/routes")

  const a = new Hono()
  const adminApp = new Hono()
  adminApp.use("*", authMiddleware)
  adminApp.use("*", adminMiddleware)
  adminApp.route("/", adminRoutes)
  a.route("/api/admin", adminApp)
  return a
}

// Helper: create an admin user directly in DB and return a JWT
async function createAdminUser(email: string, username: string): Promise<{ token: string; id: string }> {
  const id = userId()
  const now = new Date()
  await db.insert(users).values({
    id,
    username,
    email,
    displayName: null,
    workspaceId: null,
    role: "admin",
    createdAt: now,
    updatedAt: now,
  })
  const token = await signJwt({ userId: id, role: "admin" })
  return { token, id }
}

// Helper: create a regular user directly in DB and return a JWT
async function createRegularUser(email: string, username: string): Promise<{ token: string; id: string }> {
  const id = userId()
  const now = new Date()
  await db.insert(users).values({
    id,
    username,
    email,
    displayName: null,
    workspaceId: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
  })
  const token = await signJwt({ userId: id, role: "user" })
  return { token, id }
}

// ---------------------------------------------------------------------------
// 1. Admin lists all users
// ---------------------------------------------------------------------------
test("admin can list all users", async () => {
  await createRegularUser("user1@example.com", "userone")
  await createRegularUser("user2@example.com", "usertwo")
  const { token } = await createAdminUser("admin@example.com", "adminuser")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(Array.isArray(body.users)).toBe(true)
  expect(body.users.length).toBeGreaterThanOrEqual(2)
  expect(typeof body.total).toBe("number")
  expect(body.total).toBeGreaterThanOrEqual(2)
})

// ---------------------------------------------------------------------------
// 2. Admin search by username (fuzzy)
// ---------------------------------------------------------------------------
test("admin can search users by username", async () => {
  await createRegularUser("search1@example.com", "alice_find")
  await createRegularUser("search2@example.com", "bob_hide")
  const { token } = await createAdminUser("admin2@example.com", "admin2")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users?search=alice", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.users.length).toBeGreaterThanOrEqual(1)
  const usernames = body.users.map((u: any) => u.username)
  expect(usernames).toContain("alice_find")
  expect(usernames).not.toContain("bob_hide")
})

// ---------------------------------------------------------------------------
// 3. Admin search by email (fuzzy)
// ---------------------------------------------------------------------------
test("admin can search users by email", async () => {
  await createRegularUser("special@example.com", "specialuser")
  await createRegularUser("other@test.com", "otheruser")
  const { token } = await createAdminUser("admin3@example.com", "admin3")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users?search=special", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.users.length).toBeGreaterThanOrEqual(1)
  const emails = body.users.map((u: any) => u.email)
  expect(emails).toContain("special@example.com")
})

// ---------------------------------------------------------------------------
// 4. Admin pagination (limit/offset)
// ---------------------------------------------------------------------------
test("admin list supports limit/offset pagination", async () => {
  await createRegularUser("page1@example.com", "pageuser1")
  await createRegularUser("page2@example.com", "pageuser2")
  await createRegularUser("page3@example.com", "pageuser3")
  const { token } = await createAdminUser("admin4@example.com", "admin4")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users?limit=2&offset=0", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.users.length).toBeLessThanOrEqual(2)
  expect(body.total).toBeGreaterThanOrEqual(3) // total still counts all
})

// ---------------------------------------------------------------------------
// 5. Admin promotes user to admin
// ---------------------------------------------------------------------------
test("admin can promote user to admin", async () => {
  const { id: targetId } = await createRegularUser("promote@example.com", "promoteme")
  const { token } = await createAdminUser("admin5@example.com", "admin5")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request(`http://localhost/api/admin/users/${targetId}/role`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "admin" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.user.role).toBe("admin")
  expect(body.user.id).toBe(targetId)

  // Verify in DB
  const dbUser = await db.select().from(users).where(eq(users.id, targetId))
  expect(dbUser[0]!.role).toBe("admin")
})

// ---------------------------------------------------------------------------
// 6. Admin demotes admin to user
// ---------------------------------------------------------------------------
test("admin can demote another admin to user", async () => {
  const { id: targetId } = await createAdminUser("demote@example.com", "demoteme")
  const { token } = await createAdminUser("admin6@example.com", "admin6")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request(`http://localhost/api/admin/users/${targetId}/role`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "user" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any>
  expect(body.user.role).toBe("user")

  const dbUser = await db.select().from(users).where(eq(users.id, targetId))
  expect(dbUser[0]!.role).toBe("user")
})

// ---------------------------------------------------------------------------
// 7. Admin cannot demote self
// ---------------------------------------------------------------------------
test("admin cannot demote themselves", async () => {
  const { token, id: adminId } = await createAdminUser("selfdemote@example.com", "selfadmin")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request(`http://localhost/api/admin/users/${adminId}/role`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "user" }),
    }),
  )
  expect(res.status).toBe(400)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("CANNOT_SELF_DEMOTE")
})

// ---------------------------------------------------------------------------
// 8. Regular user gets 403 on admin endpoints
// ---------------------------------------------------------------------------
test("regular user gets 403 on admin endpoints", async () => {
  const { token } = await createRegularUser("normie@example.com", "normie")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(403)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("FORBIDDEN")
})

// ---------------------------------------------------------------------------
// 9. Update non-existent user → 404
// ---------------------------------------------------------------------------
test("updating non-existent user role returns 404", async () => {
  const { token } = await createAdminUser("admin7@example.com", "admin7")

  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users/usr_nonexistent123/role", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role: "admin" }),
    }),
  )
  expect(res.status).toBe(404)
  const body = await res.json() as Record<string, any>
  expect(body.error.code).toBe("NOT_FOUND")
})

// ---------------------------------------------------------------------------
// 10. No token → 401
// ---------------------------------------------------------------------------
test("no token on admin endpoint returns 401", async () => {
  const app = await buildAppWithAdminRoutes()
  const res = await app.fetch(
    new Request("http://localhost/api/admin/users"),
  )
  expect(res.status).toBe(401)
})
