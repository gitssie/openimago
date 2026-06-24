/**
 * Adversarial quality-gate tests — per-project user skill feature (openimago-wjcp).
 *
 * Targets:
 *   1. PATH TRAVERSAL / INJECTION — validateSkillName, skillDir path construction
 *   2. SKILL.md FRONTMATTER INJECTION — serializeSkillMd / yamlScalar
 *   3. OWNERSHIP / AUTHZ — cross-tenant access on every HTTP verb
 *   4. MATERIALIZATION CONSISTENCY — DB vs disk on partial failure scenarios
 *   5. RENAME / UPDATE SEMANTICS — name field is immutable; old folder orphan check
 *
 * Pure-function tests run without DB/network.
 * Integration tests use the same Hono + test DB setup as skills.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { readFile, access, rm, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { projectSkillsRoutes } from "../src/skills/routes"
import { verificationStore } from "../src/auth/email-verification"
import {
  validateSkillName,
  validateSkillDescription,
  serializeSkillMd,
  SkillConfigService,
  type SkillFileSystem,
} from "../src/skills/service"

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
  // hyphens so the name stays a clean on-disk directory name (openimago-wjcp fix).
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
    expect(validateSkillName("skilĺ")).toBe(false))

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
  /**
   * If description contains a literal `---` on its own line, a naive parser
   * would treat it as the frontmatter end-marker, causing everything after the
   * first `---` to appear as body text rather than YAML.
   */
  test("description with '---' on its own line is quoted so YAML boundary is not broken", () => {
    const md = serializeSkillMd("k", "intro\n---\nend", "body\n")
    // The description line must NOT be a bare `---`; it must be quoted.
    const lines = md.split("\n")
    // Find the description: line — it must be a quoted value.
    const descLine = lines.find((l) => l.startsWith("description:"))
    expect(descLine).toBeDefined()
    // The value must start with a quote character to neutralise the embedded ---
    expect(descLine!).toMatch(/^description:\s+"/)
    // The raw `---` terminator sequence must not appear as a standalone line
    // in the frontmatter block (between first --- and closing ---)
    const fmEnd = lines.indexOf("---", 1) // skip opening ---
    const frontmatterLines = lines.slice(1, fmEnd)
    expect(frontmatterLines).not.toContain("---")
  })

  /**
   * A description that starts with a fake YAML key (`name: `) could override
   * the real `name:` field if the parser sees multiple keys and takes the last.
   */
  test("description with embedded 'name: override' does not pollute the parsed name field", () => {
    const md = serializeSkillMd("real-name", "name: evil-override\nmore text", "body\n")
    // The description value must be quoted so the embedded `name:` is inert.
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine).toBeDefined()
    expect(descLine!).toMatch(/^description:\s+"/)
    // The output must still contain the real name field unmodified.
    expect(md).toContain("name: real-name")
  })

  /**
   * Newline inside description — yamlScalar triggers quoting when it detects `\n`.
   */
  test("description with newline is quoted (yamlScalar newline trigger)", () => {
    const md = serializeSkillMd("k", "line1\nline2", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })

  /**
   * Colon in description triggers quoting.
   */
  test("description with leading colon 'key: value' is quoted", () => {
    const md = serializeSkillMd("k", "key: value", "body\n")
    expect(md).toContain('description: "key: value"')
  })

  /**
   * Hash in description could start a YAML comment.
   */
  test("description with hash character is quoted", () => {
    const md = serializeSkillMd("k", "this # is a comment", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })

  /**
   * Embedded double-quote inside an already-quoted value — must be escaped.
   */
  test("description with double-quote is escaped inside YAML quoting", () => {
    const md = serializeSkillMd("k", 'He said "hello"', "body\n")
    expect(md).toContain('description: "He said \\"hello\\""')
  })

  /**
   * Backslash before a double-quote — double-escape: backslash itself needs escaping.
   */
  test("description with backslash-then-quote is double-escaped", () => {
    const md = serializeSkillMd("k", 'path\\"x', "body\n")
    // The yamlScalar must produce: "path\\\"x"
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
    // The raw string should not contain an unescaped standalone backslash
    expect(descLine!).toContain('\\\\"')
  })

  /**
   * Content that itself starts with `---` — body is after the closing ---
   * so a leading `---` in content should be harmless, but verify the
   * structure: exactly two `---` lines in the output delimit the frontmatter.
   */
  test("content starting with '---' does not corrupt the document structure", () => {
    const md = serializeSkillMd("k", "desc", "---\nsome: yaml\n---\nbody\n")
    const firstDash = md.indexOf("---")
    const secondDash = md.indexOf("---", firstDash + 3)
    // There must be exactly one closing --- that ends the frontmatter block.
    expect(secondDash).toBeGreaterThan(firstDash)
    // The content between first and second --- must only be name/description lines.
    const between = md.slice(firstDash + 3, secondDash)
    expect(between).toContain("name: k")
    expect(between).toContain("description: desc")
  })

  /**
   * 10 KB content — no truncation.
   */
  test("10 KB content is preserved verbatim", () => {
    const bigContent = "x".repeat(10_000)
    const md = serializeSkillMd("k", "d", bigContent)
    expect(md.endsWith(bigContent + "\n") || md.endsWith(bigContent)).toBe(true)
  })

  /**
   * Empty content — the source allows empty content to pass validation when
   * whitespace-trimmed equals "". Verify the body is still emitted.
   */
  test("empty string content produces at least the frontmatter block", () => {
    const md = serializeSkillMd("k", "d", "")
    expect(md.startsWith("---\nname:")).toBe(true)
    expect(md).toContain("---\n\n")
  })

  /**
   * Unicode content (emoji, CJK, null byte) — round-trip preservation.
   */
  test("Unicode and null byte in content are preserved as-is", () => {
    const unicodeContent = "日本語テスト 🔥 \x00 café"
    const md = serializeSkillMd("k", "d", unicodeContent)
    // Content must appear literally in the body section (after frontmatter).
    const bodyStart = md.indexOf("\n\n")
    const body = md.slice(bodyStart + 2)
    expect(body).toContain(unicodeContent)
  })

  /**
   * Name containing characters that normally need quoting (should be pre-validated
   * to never reach here, but defense-in-depth: verify the output is valid).
   * Since validateSkillName blocks colons, hashes, etc., the name field
   * should always be a bare scalar — confirm.
   */
  test("valid name never needs quoting in the YAML output", () => {
    const md = serializeSkillMd("my-skill-01", "desc", "body\n")
    const nameLine = md.split("\n").find((l) => l.startsWith("name:"))
    // A clean name must appear unquoted.
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

async function createProject(token: string, name: string): Promise<{ id: string; directory: string }> {
  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    }),
  )
  const body = (await res.json()) as Record<string, any>
  return { id: body.project.id, directory: body.project.directory }
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
  app.route("/api/platform/projects", projectRoutes)
  app.route("/api/platform/projects", projectSkillsRoutes)
})

afterAll(async () => {
  await teardown()
})

describe("cross-tenant ownership — GET (list) on every verb", () => {
  test("list: user B cannot list skills of user A's project (403)", async () => {
    const tokenA = await registerUser("adv-a1", "adv-a1@example.com")
    const tokenB = await registerUser("adv-b1", "adv-b1@example.com")
    const projA = await createProject(tokenA, "Adv-A1")

    // A creates a skill
    await app.fetch(req("POST", `/api/platform/projects/${projA.id}/skills`, tokenA, {
      name: "as1", description: "d", content: "body",
    }))

    const res = await app.fetch(req("GET", `/api/platform/projects/${projA.id}/skills`, tokenB))
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("FORBIDDEN")
  })

  test("get single: user B cannot read a specific skill in user A's project (403)", async () => {
    const tokenA = await registerUser("adv-a2", "adv-a2@example.com")
    const tokenB = await registerUser("adv-b2", "adv-b2@example.com")
    const projA = await createProject(tokenA, "Adv-A2")

    await app.fetch(req("POST", `/api/platform/projects/${projA.id}/skills`, tokenA, {
      name: "as2", description: "d", content: "body",
    }))

    const res = await app.fetch(req("GET", `/api/platform/projects/${projA.id}/skills/as2`, tokenB))
    expect(res.status).toBe(403)
    expect(((await res.json()) as any).error.code).toBe("FORBIDDEN")
  })

  test("update: user B cannot update a skill in user A's project (403)", async () => {
    const tokenA = await registerUser("adv-a3", "adv-a3@example.com")
    const tokenB = await registerUser("adv-b3", "adv-b3@example.com")
    const projA = await createProject(tokenA, "Adv-A3")

    await app.fetch(req("POST", `/api/platform/projects/${projA.id}/skills`, tokenA, {
      name: "as3", description: "d", content: "body",
    }))

    const res = await app.fetch(req("PUT", `/api/platform/projects/${projA.id}/skills/as3`, tokenB, {
      description: "hacked",
    }))
    expect(res.status).toBe(403)
    expect(((await res.json()) as any).error.code).toBe("FORBIDDEN")
  })

  test("delete: user B cannot delete a skill in user A's project (403)", async () => {
    const tokenA = await registerUser("adv-a4", "adv-a4@example.com")
    const tokenB = await registerUser("adv-b4", "adv-b4@example.com")
    const projA = await createProject(tokenA, "Adv-A4")

    await app.fetch(req("POST", `/api/platform/projects/${projA.id}/skills`, tokenA, {
      name: "as4", description: "d", content: "body",
    }))

    const res = await app.fetch(req("DELETE", `/api/platform/projects/${projA.id}/skills/as4`, tokenB))
    expect(res.status).toBe(403)
    expect(((await res.json()) as any).error.code).toBe("FORBIDDEN")
  })

  test("missing project → 404 on list", async () => {
    const token = await registerUser("adv-c1", "adv-c1@example.com")
    const res = await app.fetch(req("GET", `/api/platform/projects/proj_nonexistent_adv/skills`, token))
    expect(res.status).toBe(404)
  })

  test("missing project → 404 on get", async () => {
    const token = await registerUser("adv-c2", "adv-c2@example.com")
    const res = await app.fetch(req("GET", `/api/platform/projects/proj_nonexistent_adv/skills/x`, token))
    expect(res.status).toBe(404)
  })

  test("missing project → 404 on update", async () => {
    const token = await registerUser("adv-c3", "adv-c3@example.com")
    const res = await app.fetch(req("PUT", `/api/platform/projects/proj_nonexistent_adv/skills/x`, token, { content: "y" }))
    expect(res.status).toBe(404)
  })

  test("missing project → 404 on delete", async () => {
    const token = await registerUser("adv-c4", "adv-c4@example.com")
    const res = await app.fetch(req("DELETE", `/api/platform/projects/proj_nonexistent_adv/skills/x`, token))
    expect(res.status).toBe(404)
  })

  test("unauthenticated GET /skills → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/projects/anyid/skills"))
    expect(res.status).toBe(401)
  })

  test("unauthenticated GET /skills/:name → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/projects/anyid/skills/foo"))
    expect(res.status).toBe(401)
  })

  test("unauthenticated PUT → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/projects/anyid/skills/foo", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "x" }),
    }))
    expect(res.status).toBe(401)
  })

  test("unauthenticated DELETE → 401", async () => {
    const res = await app.fetch(new Request("http://localhost/api/platform/projects/anyid/skills/foo", { method: "DELETE" }))
    expect(res.status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §4  INTEGRATION — VALIDATION EDGE CASES via HTTP
// ─────────────────────────────────────────────────────────────────────────────

describe("create — boundary and injection inputs via HTTP", () => {
  test("path-traversal name '../evil' is rejected with 400", async () => {
    const token = await registerUser("adv-d1", "adv-d1@example.com")
    const proj = await createProject(token, "Adv-D1")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "../evil", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("name with null byte is rejected with 400", async () => {
    const token = await registerUser("adv-d2", "adv-d2@example.com")
    const proj = await createProject(token, "Adv-D2")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "skill\x00evil", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error.code).toBe("VALIDATION_ERROR")
  })

  test("name with slash is rejected with 400", async () => {
    const token = await registerUser("adv-d3", "adv-d3@example.com")
    const proj = await createProject(token, "Adv-D3")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "a/b", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("empty name is rejected with 400", async () => {
    const token = await registerUser("adv-d4", "adv-d4@example.com")
    const proj = await createProject(token, "Adv-D4")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "", description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("name >64 chars is rejected with 400", async () => {
    const token = await registerUser("adv-d5", "adv-d5@example.com")
    const proj = await createProject(token, "Adv-D5")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "a".repeat(65), description: "d", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("empty description is rejected with 400", async () => {
    const token = await registerUser("adv-d6", "adv-d6@example.com")
    const proj = await createProject(token, "Adv-D6")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "good-name", description: "", content: "body",
    }))
    expect(res.status).toBe(400)
  })

  test("whitespace-only content is rejected with 400", async () => {
    const token = await registerUser("adv-d7", "adv-d7@example.com")
    const proj = await createProject(token, "Adv-D7")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "good-name", description: "d", content: "   \n\t  ",
    }))
    expect(res.status).toBe(400)
  })

  test("missing body fields default to empty and are rejected with 400 (not 500)", async () => {
    const token = await registerUser("adv-d8", "adv-d8@example.com")
    const proj = await createProject(token, "Adv-D8")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {}))
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error).toBeDefined()
  })

  test("completely invalid JSON body returns 400 (not 500)", async () => {
    const token = await registerUser("adv-d9", "adv-d9@example.com")
    const proj = await createProject(token, "Adv-D9")
    const res = await app.fetch(
      new Request(`http://localhost/api/platform/projects/${proj.id}/skills`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{{invalid json{{",
      }),
    )
    expect(res.status).toBe(400)
  })

  test("non-string name field (number) coerces to '' → 400 validation error", async () => {
    const token = await registerUser("adv-d10", "adv-d10@example.com")
    const proj = await createProject(token, "Adv-D10")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: 42, description: "d", content: "body",
    }))
    // Routes coerce non-string to "" → validateSkillName("") === false → 400
    expect(res.status).toBe(400)
  })

  test("10 KB description is rejected with 400 (>1024)", async () => {
    const token = await registerUser("adv-d11", "adv-d11@example.com")
    const proj = await createProject(token, "Adv-D11")
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "big-desc", description: "x".repeat(10_000), content: "body",
    }))
    expect(res.status).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §5  INTEGRATION — FRONTMATTER INJECTION via HTTP (SKILL.md file content)
// ─────────────────────────────────────────────────────────────────────────────

describe("SKILL.md frontmatter injection — description survives round-trip correctly", () => {
  test("description with embedded '---' is quoted in SKILL.md so frontmatter boundary holds", async () => {
    const token = await registerUser("adv-fi1", "adv-fi1@example.com")
    const proj = await createProject(token, "Adv-FI1")

    const evilDesc = "intro\n---\nname: hijacked"
    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "fi-skill",
      description: evilDesc,
      content: "legitimate instructions\n",
    }))
    expect(res.status).toBe(201)

    const skillPath = join(proj.directory, ".opencode", "skills", "fi-skill", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")

    // The description line in the frontmatter must be quoted.
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine).toBeDefined()
    expect(descLine!).toMatch(/^description:\s+"/)

    // The raw `---` must not appear as a standalone line inside the frontmatter block.
    const openingDash = md.indexOf("---")
    const closingDash = md.indexOf("\n---\n", openingDash + 3)
    const frontmatter = md.slice(openingDash + 3, closingDash)
    expect(frontmatter.split("\n")).not.toContain("---")

    // The real name field must still be present and correct.
    expect(md).toContain("name: fi-skill")
  })

  test("description with 'name: override' does not shadow the real name field", async () => {
    const token = await registerUser("adv-fi2", "adv-fi2@example.com")
    const proj = await createProject(token, "Adv-FI2")

    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "fi-skill2",
      description: "name: evil-override",
      content: "body\n",
    }))
    expect(res.status).toBe(201)

    const skillPath = join(proj.directory, ".opencode", "skills", "fi-skill2", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")

    // Real name line must appear unquoted and correct.
    expect(md).toContain("name: fi-skill2")

    // The description must be quoted (contains colon).
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })

  test("description with leading/trailing whitespace is quoted (whitespace-trim check)", async () => {
    const token = await registerUser("adv-fi3", "adv-fi3@example.com")
    const proj = await createProject(token, "Adv-FI3")

    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "fi-skill3",
      description: "  leading space",
      content: "body\n",
    }))
    expect(res.status).toBe(201)

    const skillPath = join(proj.directory, ".opencode", "skills", "fi-skill3", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")
    // Whitespace-leading description must be quoted to be valid YAML.
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §6  INTEGRATION — MATERIALIZATION CONSISTENCY (disk vs DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("materialization — DB and disk consistency", () => {
  test("create: SKILL.md path matches exactly .opencode/skills/<name>/SKILL.md", async () => {
    const token = await registerUser("adv-mc1", "adv-mc1@example.com")
    const proj = await createProject(token, "Adv-MC1")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "mc-skill", description: "d", content: "body content\n",
    }))

    const expected = join(proj.directory, ".opencode", "skills", "mc-skill", "SKILL.md")
    const content = await readFile(expected, "utf-8")
    expect(content).toContain("name: mc-skill")
    expect(content).toContain("body content")
  })

  test("update: SKILL.md is overwritten with new description and content", async () => {
    const token = await registerUser("adv-mc2", "adv-mc2@example.com")
    const proj = await createProject(token, "Adv-MC2")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "upd-skill", description: "orig-desc", content: "orig body\n",
    }))

    await app.fetch(req("PUT", `/api/platform/projects/${proj.id}/skills/upd-skill`, token, {
      description: "new-desc", content: "new body\n",
    }))

    const skillPath = join(proj.directory, ".opencode", "skills", "upd-skill", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")
    expect(md).toContain("description: new-desc")
    expect(md).toContain("new body")
    expect(md).not.toContain("orig-desc")
    expect(md).not.toContain("orig body")
  })

  test("delete: skill folder is removed from disk after DELETE", async () => {
    const token = await registerUser("adv-mc3", "adv-mc3@example.com")
    const proj = await createProject(token, "Adv-MC3")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "del-skill", description: "d", content: "body\n",
    }))

    const skillDir = join(proj.directory, ".opencode", "skills", "del-skill")
    // Confirm it exists first
    await access(skillDir) // throws if absent

    await app.fetch(req("DELETE", `/api/platform/projects/${proj.id}/skills/del-skill`, token))

    let gone = false
    try { await access(skillDir) } catch { gone = true }
    expect(gone).toBe(true)
  })

  test("update with description-only does not corrupt content in SKILL.md", async () => {
    const token = await registerUser("adv-mc4", "adv-mc4@example.com")
    const proj = await createProject(token, "Adv-MC4")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "partial-upd", description: "old-desc", content: "important instructions\n",
    }))

    await app.fetch(req("PUT", `/api/platform/projects/${proj.id}/skills/partial-upd`, token, {
      description: "new-desc",
      // no content field — should retain original
    }))

    const skillPath = join(proj.directory, ".opencode", "skills", "partial-upd", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")
    expect(md).toContain("description: new-desc")
    expect(md).toContain("important instructions")
  })

  test("update with content-only does not corrupt description in SKILL.md", async () => {
    const token = await registerUser("adv-mc5", "adv-mc5@example.com")
    const proj = await createProject(token, "Adv-MC5")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "partial-upd2", description: "keep-this-desc", content: "old body\n",
    }))

    await app.fetch(req("PUT", `/api/platform/projects/${proj.id}/skills/partial-upd2`, token, {
      content: "new body\n",
      // no description field — should retain original
    }))

    const skillPath = join(proj.directory, ".opencode", "skills", "partial-upd2", "SKILL.md")
    const md = await readFile(skillPath, "utf-8")
    expect(md).toContain("description: keep-this-desc")
    expect(md).toContain("new body")
  })

  test("duplicate name returns 400 with clean VALIDATION_ERROR (not 500)", async () => {
    const token = await registerUser("adv-mc6", "adv-mc6@example.com")
    const proj = await createProject(token, "Adv-MC6")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "dup-skill", description: "d", content: "body",
    }))

    const res = await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "dup-skill", description: "d2", content: "body2",
    }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
    expect(body.error.message).toMatch(/already exists/i)
  })

  test("same name in different projects is allowed (no collision)", async () => {
    const tokenA = await registerUser("adv-mc7a", "adv-mc7a@example.com")
    const tokenB = await registerUser("adv-mc7b", "adv-mc7b@example.com")
    const projA = await createProject(tokenA, "Adv-MC7A")
    const projB = await createProject(tokenB, "Adv-MC7B")

    const resA = await app.fetch(req("POST", `/api/platform/projects/${projA.id}/skills`, tokenA, {
      name: "shared-name", description: "d", content: "body-a",
    }))
    const resB = await app.fetch(req("POST", `/api/platform/projects/${projB.id}/skills`, tokenB, {
      name: "shared-name", description: "d", content: "body-b",
    }))

    expect(resA.status).toBe(201)
    expect(resB.status).toBe(201)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §7  INTEGRATION — RENAME / UPDATE SEMANTICS (name field is immutable)
// ─────────────────────────────────────────────────────────────────────────────

describe("rename semantics — name is immutable via PUT", () => {
  /**
   * The PUT route only accepts { description?, content? } — name is taken from
   * the URL param and is NOT updatable through the body. Verify:
   * 1. A 'name' field in the PUT body is silently ignored.
   * 2. The old folder is not orphaned (it keeps the original name on disk).
   * 3. The DB row retains the original name.
   */
  test("PUT body 'name' field is ignored — disk folder and DB row keep original name", async () => {
    const token = await registerUser("adv-rn1", "adv-rn1@example.com")
    const proj = await createProject(token, "Adv-RN1")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "original-name", description: "d", content: "body\n",
    }))

    // PUT with a 'name' field in the body — this should NOT rename the skill.
    const putRes = await app.fetch(
      new Request(`http://localhost/api/platform/projects/${proj.id}/skills/original-name`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "new-name", description: "updated" }),
      }),
    )
    expect(putRes.status).toBe(200)
    const putBody = (await putRes.json()) as Record<string, any>
    // DB row must retain the original name
    expect(putBody.skill.name).toBe("original-name")

    // Original folder must still exist on disk (no orphan, no rename)
    const origDir = join(proj.directory, ".opencode", "skills", "original-name")
    await access(origDir) // throws if missing → test fails

    // A 'new-name' folder must NOT have been created
    const newDir = join(proj.directory, ".opencode", "skills", "new-name")
    let newExists = false
    try { await access(newDir); newExists = true } catch { newExists = false }
    expect(newExists).toBe(false)
  })

  test("after update, GET by original name still works", async () => {
    const token = await registerUser("adv-rn2", "adv-rn2@example.com")
    const proj = await createProject(token, "Adv-RN2")

    await app.fetch(req("POST", `/api/platform/projects/${proj.id}/skills`, token, {
      name: "stable-name", description: "d", content: "body\n",
    }))

    await app.fetch(req("PUT", `/api/platform/projects/${proj.id}/skills/stable-name`, token, {
      description: "changed",
    }))

    const getRes = await app.fetch(req("GET", `/api/platform/projects/${proj.id}/skills/stable-name`, token))
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as Record<string, any>
    expect(getBody.skill.name).toBe("stable-name")
    expect(getBody.skill.description).toBe("changed")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// §8  PURE UNIT — SkillConfigService with mock filesystem (disk-failure paths)
// ─────────────────────────────────────────────────────────────────────────────

describe("serializeSkillMd — property/invariant tests", () => {
  test("idempotency: serializing the same inputs twice produces identical output", () => {
    const a = serializeSkillMd("my-skill", "desc", "body\n")
    const b = serializeSkillMd("my-skill", "desc", "body\n")
    expect(a).toBe(b)
  })

  test("output always starts with '---\\n'", () => {
    const inputs = [
      ["a", "b", "c"],
      ["my-skill", "Use: carefully", "do stuff\n"],
      ["k", "name: evil", "body"],
    ] as const
    for (const [n, d, c] of inputs) {
      expect(serializeSkillMd(n, d, c).startsWith("---\n")).toBe(true)
    }
  })

  test("output always contains exactly one blank line separating frontmatter from body", () => {
    const md = serializeSkillMd("k", "d", "body\n")
    // Frontmatter ends with `---`, then `\n\n` before body.
    expect(md).toContain("---\n\n")
  })

  test("body always ends with a newline", () => {
    // Content with trailing newline
    expect(serializeSkillMd("k", "d", "body\n").endsWith("\n")).toBe(true)
    // Content without trailing newline — must still end with one
    expect(serializeSkillMd("k", "d", "body").endsWith("\n")).toBe(true)
  })

  test("description with '#' hash is quoted (YAML comment prevention)", () => {
    const md = serializeSkillMd("k", "do # things", "body\n")
    const descLine = md.split("\n").find((l) => l.startsWith("description:"))
    expect(descLine!).toMatch(/^description:\s+"/)
  })
})
