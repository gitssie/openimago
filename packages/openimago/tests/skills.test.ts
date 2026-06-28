/**
 * Per-user skill config — route + service integration tests (openimago-680i).
 *
 * Verifies the full user-scoped CRUD surface, ownership-by-user, the unique
 * (userId, name) constraint, that CRUD does NOT write to disk (DB is the single
 * source of truth), and that syncUserSkillsToDir materializes + prunes skills
 * into ${targetDir}/.opencode/skills/<name>/SKILL.md.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { readFile, access, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { userSkillsRoutes } from "../src/skills/routes"
import { skillConfigService } from "../src/skills/service"
import { db } from "../src/db/client"
import { users } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { verificationStore } from "../src/auth/email-verification"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  await app.fetch(
    new Request("http://localhost/auth/email-verification/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  )
  const code = verificationStore.getCode(email)
  if (!code) throw new Error(`No verification code for ${email}`)

  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123", verificationCode: code }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  return body.token as string
}

async function userIdForEmail(email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (!row) throw new Error(`No user for ${email}`)
  return row.id
}

function req(method: string, path: string, token: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/skills", userSkillsRoutes)
})

afterAll(async () => {
  await teardown()
})

describe("skill create", () => {
  test("creates a skill and does NOT write to disk (DB is source of truth)", async () => {
    const token = await registerUser("sk1", "sk1@example.com")

    const res = await app.fetch(
      req("POST", `/api/platform/skills`, token, {
        name: "my-skill",
        description: "Does a thing",
        content: "Step 1. Do the thing.",
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, any>
    expect(body.skill.name).toBe("my-skill")
    expect(body.skill.id).toMatch(/^skl_/)
    // No projectId leaks into the DTO.
    expect(body.skill.projectId).toBeUndefined()
  })

  test("rejects invalid name with 400", async () => {
    const token = await registerUser("sk2", "sk2@example.com")
    const res = await app.fetch(
      req("POST", `/api/platform/skills`, token, {
        name: "My_Skill", description: "x", content: "body",
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("rejects description >1024 with 400", async () => {
    const token = await registerUser("sk3", "sk3@example.com")
    const res = await app.fetch(
      req("POST", `/api/platform/skills`, token, {
        name: "longdesc", description: "a".repeat(1025), content: "body",
      }),
    )
    expect(res.status).toBe(400)
  })

  test("duplicate name for same user returns 400", async () => {
    const token = await registerUser("sk4", "sk4@example.com")
    await app.fetch(
      req("POST", `/api/platform/skills`, token, { name: "dup", description: "d", content: "body" }),
    )
    const res = await app.fetch(
      req("POST", `/api/platform/skills`, token, { name: "dup", description: "d2", content: "body2" }),
    )
    expect(res.status).toBe(400)
  })

  test("same name for different users is allowed", async () => {
    const tokenA = await registerUser("sk4a", "sk4a@example.com")
    const tokenB = await registerUser("sk4b", "sk4b@example.com")
    const resA = await app.fetch(
      req("POST", `/api/platform/skills`, tokenA, { name: "shared", description: "d", content: "a" }),
    )
    const resB = await app.fetch(
      req("POST", `/api/platform/skills`, tokenB, { name: "shared", description: "d", content: "b" }),
    )
    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)
  })
})

describe("skill auth", () => {
  test("without auth returns 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/skills"))
    expect(res.status).toBe(401)
  })
})

describe("skill list / get / update / delete", () => {
  test("full CRUD happy path (no disk side effects)", async () => {
    const token = await registerUser("sk7", "sk7@example.com")

    // create
    await app.fetch(
      req("POST", `/api/platform/skills`, token, {
        name: "crud-skill", description: "orig", content: "orig body",
      }),
    )

    // list
    const listRes = await app.fetch(req("GET", `/api/platform/skills`, token))
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as Record<string, any>
    expect(listBody.skills.length).toBe(1)
    expect(listBody.skills[0].name).toBe("crud-skill")

    // get
    const getRes = await app.fetch(req("GET", `/api/platform/skills/crud-skill`, token))
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as Record<string, any>
    expect(getBody.skill.content).toBe("orig body")

    // update
    const updRes = await app.fetch(
      req("PUT", `/api/platform/skills/crud-skill`, token, {
        description: "updated", content: "new body",
      }),
    )
    expect(updRes.status).toBe(200)
    const updBody = (await updRes.json()) as Record<string, any>
    expect(updBody.skill.description).toBe("updated")
    expect(updBody.skill.content).toBe("new body")

    // delete
    const delRes = await app.fetch(req("DELETE", `/api/platform/skills/crud-skill`, token))
    expect(delRes.status).toBe(200)

    const listAfter = await app.fetch(req("GET", `/api/platform/skills`, token))
    const listAfterBody = (await listAfter.json()) as Record<string, any>
    expect(listAfterBody.skills.length).toBe(0)
  })

  test("list is scoped to the calling user only", async () => {
    const tokenA = await registerUser("sk7a", "sk7a@example.com")
    const tokenB = await registerUser("sk7b", "sk7b@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "a-skill", description: "d", content: "x" }))
    await app.fetch(req("POST", `/api/platform/skills`, tokenB, { name: "b-skill", description: "d", content: "y" }))

    const listB = await app.fetch(req("GET", `/api/platform/skills`, tokenB))
    const bodyB = (await listB.json()) as Record<string, any>
    expect(bodyB.skills.map((s: any) => s.name)).toEqual(["b-skill"])
  })

  test("user B cannot get/update/delete user A's skill (404 — not visible)", async () => {
    const tokenA = await registerUser("sk7c", "sk7c@example.com")
    const tokenB = await registerUser("sk7d", "sk7d@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "private", description: "d", content: "x" }))

    expect((await app.fetch(req("GET", `/api/platform/skills/private`, tokenB))).status).toBe(404)
    expect((await app.fetch(req("PUT", `/api/platform/skills/private`, tokenB, { content: "hack" }))).status).toBe(404)
    expect((await app.fetch(req("DELETE", `/api/platform/skills/private`, tokenB))).status).toBe(404)
  })

  test("get / update / delete of missing skill returns 404", async () => {
    const token = await registerUser("sk8", "sk8@example.com")
    expect((await app.fetch(req("GET", `/api/platform/skills/nope`, token))).status).toBe(404)
    expect((await app.fetch(req("PUT", `/api/platform/skills/nope`, token, { content: "x" }))).status).toBe(404)
    expect((await app.fetch(req("DELETE", `/api/platform/skills/nope`, token))).status).toBe(404)
  })
})

describe("syncUserSkillsToDir", () => {
  let tmp: string

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "skills-sync-"))
  })

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  test("materializes all active skills to .opencode/skills/<name>/SKILL.md", async () => {
    const token = await registerUser("sync1", "sync1@example.com")
    const userId = await userIdForEmail("sync1@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "alpha", description: "A skill", content: "do alpha" }))
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "beta", description: "B skill", content: "do beta" }))

    const dir = join(tmp, "sync1")
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    const alpha = await readFile(join(dir, ".opencode", "skills", "alpha", "SKILL.md"), "utf-8")
    expect(alpha).toContain("name: alpha")
    expect(alpha).toContain("description: A skill")
    expect(alpha).toContain("do alpha")

    const beta = await readFile(join(dir, ".opencode", "skills", "beta", "SKILL.md"), "utf-8")
    expect(beta).toContain("name: beta")
  })

  test("prunes skill dirs that are no longer in the user's DB set", async () => {
    const token = await registerUser("sync2", "sync2@example.com")
    const userId = await userIdForEmail("sync2@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "keep", description: "d", content: "k" }))
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "gone", description: "d", content: "g" }))

    const dir = join(tmp, "sync2")
    await skillConfigService.syncUserSkillsToDir(userId, dir)
    // both present
    await access(join(dir, ".opencode", "skills", "keep"))
    await access(join(dir, ".opencode", "skills", "gone"))

    // delete one, re-sync → its dir should be pruned
    await app.fetch(req("DELETE", `/api/platform/skills/gone`, token))
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    await access(join(dir, ".opencode", "skills", "keep")) // still there
    let pruned = false
    try { await access(join(dir, ".opencode", "skills", "gone")) } catch { pruned = true }
    expect(pruned).toBe(true)
  })

  test("re-sync overwrites an updated skill's SKILL.md", async () => {
    const token = await registerUser("sync3", "sync3@example.com")
    const userId = await userIdForEmail("sync3@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "evolve", description: "old", content: "old body" }))

    const dir = join(tmp, "sync3")
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    await app.fetch(req("PUT", `/api/platform/skills/evolve`, token, { description: "new", content: "new body" }))
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    const md = await readFile(join(dir, ".opencode", "skills", "evolve", "SKILL.md"), "utf-8")
    expect(md).toContain("description: new")
    expect(md).toContain("new body")
    expect(md).not.toContain("old body")
  })

  test("materialized SKILL.md has exactly one frontmatter when content was pasted with one", async () => {
    // Regression for openimago-9qs5: a user pasting a full SKILL.md as content
    // must not produce a double frontmatter in the materialized file.
    const token = await registerUser("sync5", "sync5@example.com")
    const userId = await userIdForEmail("sync5@example.com")
    const pastedContent = "---\nname: dbl\ndescription: pasted\n---\n\n# Real body\ninstructions here\n"
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "dbl", description: "Real desc", content: pastedContent }))

    const dir = join(tmp, "sync5")
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    const md = await readFile(join(dir, ".opencode", "skills", "dbl", "SKILL.md"), "utf-8")
    const fences = md.match(/^---$/gm) ?? []
    expect(fences.length).toBe(2) // single block: opening + closing
    expect(md).toContain("description: Real desc")
    expect(md).not.toContain("description: pasted")
    expect(md).toContain("# Real body")
  })

  test("sync to an empty user library prunes a stale dir and writes nothing", async () => {
    const token = await registerUser("sync4", "sync4@example.com")
    const userId = await userIdForEmail("sync4@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "temp", description: "d", content: "t" }))
    const dir = join(tmp, "sync4")
    await skillConfigService.syncUserSkillsToDir(userId, dir)
    await access(join(dir, ".opencode", "skills", "temp"))

    await app.fetch(req("DELETE", `/api/platform/skills/temp`, token))
    await skillConfigService.syncUserSkillsToDir(userId, dir)

    let gone = false
    try { await access(join(dir, ".opencode", "skills", "temp")) } catch { gone = true }
    expect(gone).toBe(true)
  })
})
