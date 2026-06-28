/**
 * Adversarial quality-gate tests — per-user skill feature (openimago-680i,
 * supersedes per-project openimago-wjcp).
 *
 * Targets:
 *   1. PATH TRAVERSAL / INJECTION — validateSkillName
 *   2. SKILL.md FRONTMATTER INJECTION — serializeSkillMd / yamlScalar
 *   3. OWNERSHIP / AUTHZ — cross-tenant access on every HTTP verb (by user)
 *   4. VALIDATION EDGE CASES via HTTP
 *   5. SYNC MATERIALIZATION + PRUNE — syncUserSkillsToDir with mock filesystem
 *
 * Pure-function tests run without DB/network.
 * Integration tests use the same Hono + test DB setup as skills.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { userSkillsRoutes } from "../src/skills/routes"
import { verificationStore } from "../src/auth/email-verification"
import {
  validateSkillName,
  serializeSkillMd,
  SkillConfigService,
  type SkillFileSystem,
} from "../src/skills/service"
import { db } from "../src/db/client"
import { users, userSkills } from "../src/db/schema"
import { eq } from "drizzle-orm"
import { skillId } from "../src/utils/ids"

// ─────────────────────────────────────────────────────────────────────────────
// §1  PURE FUNCTION — PATH TRAVERSAL: validateSkillName
// ─────────────────────────────────────────────────────────────────────────────

describe("validateSkillName — path traversal and injection", () => {
  // Straight traversal sequences
  test("rejects '..'", () => expect(validateSkillName("..")).toBe(false))
  test("rejects '.'", () => expect(validateSkillName(".")).toBe(false))
  test("rejects '../etc'", () => expect(validateSkillName("../etc")).toBe(false))
  test("rejects '../../root'", () => expect(validateSkillName("../../root")).toBe(false))

  // Embedded slashes
  test("rejects 'a/b'", () => expect(validateSkillName("a/b")).toBe(false))
  test("rejects '/absolute'", () => expect(validateSkillName("/absolute")).toBe(false))
  test("rejects 'a\\b' (backslash)", () => expect(validateSkillName("a\\b")).toBe(false))

  // Null byte
  test("rejects null byte (\\x00)", () => expect(validateSkillName("skill\x00evil")).toBe(false))

  // Slug convention: ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ rejects leading/trailing
  // hyphens so the name stays a clean on-disk directory name.
  test("rejects leading hyphen '-skill'", () => {
    expect(validateSkillName("-skill")).toBe(false)
  })

  test("rejects trailing hyphen 'skill-'", () => {
    expect(validateSkillName("skill-")).toBe(false)
  })

  // Unicode characters that look like ASCII
  test("rejects Unicode fullwidth slash (／ U+FF0F)", () =>
    expect(validateSkillName("a／b")).toBe(false))
  test("rejects Unicode dot leader (… U+2026)", () =>
    expect(validateSkillName("..…")).toBe(false))
  test("rejects RTL override char (U+202E)", () =>
    expect(validateSkillName("skill‮evil")).toBe(false))
  test("rejects emoji", () =>
    expect(validateSkillName("skill🔥")).toBe(false))
  test("rejects combining diacritical (U+0301)", () =>
    expect(validateSkillName("skilĺ")).toBe(false))

  // Length boundaries
  test("rejects empty string", () => expect(validateSkillName("")).toBe(false))
  test("accepts exactly 64 chars", () => expect(validateSkillName("a".repeat(64))).toBe(true))
  test("rejects 65 chars", () => expect(validateSkillName("a".repeat(65))).toBe(false))
  test("rejects 10 KB name", () => expect(validateSkillName("a".repeat(10_000))).toBe(false))

  // Uppercase / spaces
  test("rejects uppercase 'SKILL'", () => expect(validateSkillName("SKILL")).toBe(false))
  test("rejects space 'my skill'", () => expect(validateSkillName("my skill")).toBe(false))

  // SQL / shell injection chars
  test("rejects single quote", () => expect(validateSkillName("skill'x")).toBe(false))
  test("rejects semicolon", () => expect(validateSkillName("skill;drop")).toBe(false))
  test("rejects dollar sign", () => expect(validateSkillName("skill$var")).toBe(false))
  test("rejects backtick", () => expect(validateSkillName("skill`cmd`")).toBe(false))

  // Valid edge cases
  test("accepts single char 'a'", () => expect(validateSkillName("a")).toBe(true))
  test("accepts '0'", () => expect(validateSkillName("0")).toBe(true))
  test("accepts 'my-skill-2'", () => expect(validateSkillName("my-skill-2")).toBe(true))
})

// ─────────────────────────────────────────────────────────────────────────────
// §2  PURE FUNCTION — FRONTMATTER INJECTION: serializeSkillMd / yamlScalar
// ─────────────────────────────────────────────────────────────────────────────

describe("serializeSkillMd — YAML frontmatter injection", () => {
  test("description with '---' on its own line is quoted so YAML boundary is not broken", () => {
    const md = serializeSkillMd("k", "intro\n---\nend", "body\n")
    const lines = md.split("\n")
    const descLine = lines.find((l) => l.startsWith("description:"))
    expect(descLine).toBeDefined()
    expect(descLine!).toMatch(/^description:\s+"/)
    const fmEnd = lines.indexOf("---", 1)
    const frontmatterLines = lines.slice(1, fmEnd)
    expect(frontmatterLines).not.toContain("---")
  })

  test("description with embedded 'name: override' does not pollute the parsed name field", () => {
    const md = serializeSkillMd("real-name", "name: evil-override\nmore text", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine).toBeDefined()
    expect(descLine!).toMatch(/^description:\s+"/)
    expect(md).toContain("name: real-name")
  })

  test("description with newline is quoted (yamlScalar newline trigger)", () => {
    const md = serializeSkillMd("k", "line1\nline2", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })

  test("description with leading colon 'key: value' is quoted", () => {
    const md = serializeSkillMd("k", "key: value", "body\n")
    expect(md).toContain('description: "key: value"')
  })

  test("description with hash character is quoted", () => {
    const md = serializeSkillMd("k", "this # is a comment", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })

  test("description with double-quote is escaped inside YAML quoting", () => {
    const md = serializeSkillMd("k", 'He said "hello"', "body\n")
    expect(md).toContain('description: "He said \\"hello\\""')
  })

  test("description with backslash-then-quote is double-escaped", () => {
    const md = serializeSkillMd("k", 'path\\"x', "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
    expect(descLine!).toContain('\\\\"')
  })

  test("content starting with '---' does not corrupt the document structure", () => {
    const md = serializeSkillMd("k", "desc", "---\nsome: yaml\n---\nbody\n")
    const firstDash = md.indexOf("---")
    const secondDash = md.indexOf("---", firstDash + 3)
    expect(secondDash).toBeGreaterThan(firstDash)
    const between = md.slice(firstDash + 3, secondDash)
    expect(between).toContain("name: k")
    expect(between).toContain("description: desc")
  })

  test("10 KB content is preserved verbatim", () => {
    const bigContent = "x".repeat(10_000)
    const md = serializeSkillMd("k", "d", bigContent)
    expect(md.endsWith(bigContent + "\n") || md.endsWith(bigContent)).toBe(true)
  })

  test("empty string content produces at least the frontmatter block", () => {
    const md = serializeSkillMd("k", "d", "")
    expect(md.startsWith("---\nname:")).toBe(true)
    expect(md).toContain("---\n\n")
  })

  test("Unicode and null byte in content are preserved as-is", () => {
    const unicodeContent = "日本語テスト 🔥 \x00 café"
    const md = serializeSkillMd("k", "d", unicodeContent)
    const bodyStart = md.indexOf("\n\n")
    const body = md.slice(bodyStart + 2)
    expect(body).toContain(unicodeContent)
  })

  test("valid name never needs quoting in the YAML output", () => {
    const md = serializeSkillMd("my-skill-01", "desc", "body\n")
    const nameLine = md.split("\n").find((l) => l.startsWith("name:"))
    expect(nameLine).toBe("name: my-skill-01")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §3  INTEGRATION — AUTHZ + CROSS-TENANT ACCESS (HTTP layer)
// ─────────────────────────────────────────────────────────────────────────────

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

describe("cross-tenant ownership — by user on every verb", () => {
  test("list: user B's list never includes user A's skills", async () => {
    const tokenA = await registerUser("adv-a1", "adv-a1@example.com")
    const tokenB = await registerUser("adv-b1", "adv-b1@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "as1", description: "d", content: "body" }))

    const res = await app.fetch(req("GET", `/api/platform/skills`, tokenB))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.skills.find((s: any) => s.name === "as1")).toBeUndefined()
  })

  test("get single: user B cannot read user A's skill (404 — invisible)", async () => {
    const tokenA = await registerUser("adv-a2", "adv-a2@example.com")
    const tokenB = await registerUser("adv-b2", "adv-b2@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "as2", description: "d", content: "body" }))

    const res = await app.fetch(req("GET", `/api/platform/skills/as2`, tokenB))
    expect(res.status).toBe(404)
  })

  test("update: user B cannot update user A's skill (404)", async () => {
    const tokenA = await registerUser("adv-a3", "adv-a3@example.com")
    const tokenB = await registerUser("adv-b3", "adv-b3@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "as3", description: "d", content: "body" }))

    const res = await app.fetch(req("PUT", `/api/platform/skills/as3`, tokenB, { description: "hacked" }))
    expect(res.status).toBe(404)
  })

  test("delete: user B cannot delete user A's skill (404)", async () => {
    const tokenA = await registerUser("adv-a4", "adv-a4@example.com")
    const tokenB = await registerUser("adv-b4", "adv-b4@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, tokenA, { name: "as4", description: "d", content: "body" }))

    const res = await app.fetch(req("DELETE", `/api/platform/skills/as4`, tokenB))
    expect(res.status).toBe(404)
    // A's skill must still exist.
    expect((await app.fetch(req("GET", `/api/platform/skills/as4`, tokenA))).status).toBe(200)
  })

  test("missing skill → 404 on get/update/delete", async () => {
    const token = await registerUser("adv-c1", "adv-c1@example.com")
    expect((await app.fetch(req("GET", `/api/platform/skills/nope`, token))).status).toBe(404)
    expect((await app.fetch(req("PUT", `/api/platform/skills/nope`, token, { content: "y" }))).status).toBe(404)
    expect((await app.fetch(req("DELETE", `/api/platform/skills/nope`, token))).status).toBe(404)
  })

  test("unauthenticated GET /skills → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/skills"))
    expect(res.status).toBe(401)
  })

  test("unauthenticated GET /skills/:name → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/skills/foo"))
    expect(res.status).toBe(401)
  })

  test("unauthenticated PUT → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/skills/foo", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "x" }),
    }))
    expect(res.status).toBe(401)
  })

  test("unauthenticated DELETE → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/skills/foo", { method: "DELETE" }))
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4  INTEGRATION — VALIDATION EDGE CASES via HTTP
// ─────────────────────────────────────────────────────────────────────────────

describe("create — boundary and injection inputs via HTTP", () => {
  test("path-traversal name '../evil' is rejected with 400", async () => {
    const token = await registerUser("adv-d1", "adv-d1@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "../evil", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("name with null byte is rejected with 400", async () => {
    const token = await registerUser("adv-d2", "adv-d2@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "skill\x00evil", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error.code).toBe("VALIDATION_ERROR")
  })

  test("name with slash is rejected with 400", async () => {
    const token = await registerUser("adv-d3", "adv-d3@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "a/b", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("empty name is rejected with 400", async () => {
    const token = await registerUser("adv-d4", "adv-d4@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("name >64 chars is rejected with 400", async () => {
    const token = await registerUser("adv-d5", "adv-d5@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "a".repeat(65), description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("empty description is rejected with 400", async () => {
    const token = await registerUser("adv-d6", "adv-d6@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "good-name", description: "", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("whitespace-only content is rejected with 400", async () => {
    const token = await registerUser("adv-d7", "adv-d7@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "good-name", description: "d", content: "   \n\t  ",
    }))
    expect(res.status).toBe(400)
  })

  test("missing body fields default to empty and are rejected with 400 (not 500)", async () => {
    const token = await registerUser("adv-d8", "adv-d8@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {}))
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error).toBeDefined()
  })

  test("completely invalid JSON body returns 400 (not 500)", async () => {
    const token = await registerUser("adv-d9", "adv-d9@example.com")
    const res = await app.fetch(
      new Request(`http://localhost/api/platform/skills`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{{invalid json{{",
      }),
    )
    expect(res.status).toBe(400)
  })

  test("non-string name field (number) coerces to '' → 400 validation error", async () => {
    const token = await registerUser("adv-d10", "adv-d10@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: 42, description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("10 KB description is rejected with 400 (>1024)", async () => {
    const token = await registerUser("adv-d11", "adv-d11@example.com")
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, {
      name: "big-desc", description: "x".repeat(10_000), content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("duplicate name for the same user returns 400 with VALIDATION_ERROR", async () => {
    const token = await registerUser("adv-d12", "adv-d12@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "dup-skill", description: "d", content: "body" }))
    const res = await app.fetch(req("POST", `/api/platform/skills`, token, { name: "dup-skill", description: "d2", content: "body2" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
    expect(body.error.message).toMatch(/already exists/i)
  })

  test("PUT body 'name' field is ignored — name is taken from the URL only", async () => {
    const token = await registerUser("adv-d13", "adv-d13@example.com")
    await app.fetch(req("POST", `/api/platform/skills`, token, { name: "original-name", description: "d", content: "body" }))

    const putRes = await app.fetch(
      new Request(`http://localhost/api/platform/skills/original-name`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "new-name", description: "updated" }),
      }),
    )
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as Record<string, any>
    expect(putBody.skill.name).toBe("original-name")

    // A 'new-name' skill must NOT have been created.
    expect((await app.fetch(req("GET", `/api/platform/skills/new-name`, token))).status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5  UNIT — syncUserSkillsToDir with mock filesystem (materialize + prune)
// ─────────────────────────────────────────────────────────────────────────────

describe("syncUserSkillsToDir — mock filesystem behavior", () => {
  /** In-memory mock fs that records mkdir/writeFile/rm and serves readdir. */
  function makeMockFs(existingDirs: string[]) {
    const writes = new Map<string, string>()
    const mkdirs: string[] = []
    const removed: string[] = []
    const fs: SkillFileSystem = {
      mkdir: async (dir) => { mkdirs.push(dir) },
      writeFile: async (file, data) => { writes.set(file, data) },
      rm: async (dir) => { removed.push(dir) },
      readdir: async () => existingDirs,
    }
    return { fs, writes, mkdirs, removed }
  }

  async function seedUser(username: string, email: string, names: string[]): Promise<string> {
    // Register through the public API so the user row + token machinery is real.
    const token = await registerUser(username, email)
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    const userId = u!.id
    const now = new Date()
    for (const name of names) {
      await db.insert(userSkills).values({
        id: skillId(),
        userId,
        name,
        description: "d",
        content: `body ${name}`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
    }
    void token
    return userId
  }

  test("writes SKILL.md for every active skill under .opencode/skills/<name>", async () => {
    const userId = await seedUser("sync-m1", "sync-m1@example.com", ["alpha", "beta"])
    const { fs, writes } = makeMockFs([])
    const svc = new SkillConfigService(fs)

    await svc.syncUserSkillsToDir(userId, "/work/proj")

    const keys = [...writes.keys()]
    expect(keys).toContain("/work/proj/.opencode/skills/alpha/SKILL.md")
    expect(keys).toContain("/work/proj/.opencode/skills/beta/SKILL.md")
    expect(writes.get("/work/proj/.opencode/skills/alpha/SKILL.md")).toContain("name: alpha")
  })

  test("prunes existing dirs that are not in the user's DB set", async () => {
    const userId = await seedUser("sync-m2", "sync-m2@example.com", ["keep"])
    // Disk already has 'keep' and a stale 'stale'.
    const { fs, removed } = makeMockFs(["keep", "stale"])
    const svc = new SkillConfigService(fs)

    await svc.syncUserSkillsToDir(userId, "/work/proj")

    expect(removed).toContain("/work/proj/.opencode/skills/stale")
    expect(removed).not.toContain("/work/proj/.opencode/skills/keep")
  })

  test("empty user library prunes all existing dirs and writes nothing", async () => {
    const userId = await seedUser("sync-m3", "sync-m3@example.com", [])
    const { fs, writes, removed } = makeMockFs(["old-a", "old-b"])
    const svc = new SkillConfigService(fs)

    await svc.syncUserSkillsToDir(userId, "/work/proj")

    expect(writes.size).toBe(0)
    expect(removed).toContain("/work/proj/.opencode/skills/old-a")
    expect(removed).toContain("/work/proj/.opencode/skills/old-b")
  })

  test("inactive (status != active) skills are not materialized", async () => {
    const userId = await seedUser("sync-m4", "sync-m4@example.com", ["active-one"])
    const now = new Date()
    await db.insert(userSkills).values({
      id: skillId(),
      userId,
      name: "archived-one",
      description: "d",
      content: "body",
      status: "archived",
      createdAt: now,
      updatedAt: now,
    })
    const { fs, writes } = makeMockFs([])
    const svc = new SkillConfigService(fs)

    await svc.syncUserSkillsToDir(userId, "/work/proj")

    const keys = [...writes.keys()]
    expect(keys).toContain("/work/proj/.opencode/skills/active-one/SKILL.md")
    expect(keys).not.toContain("/work/proj/.opencode/skills/archived-one/SKILL.md")
  })
})
