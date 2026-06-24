/**
 * Per-project user skill config — route + service integration tests.
 *
 * Verifies the full CRUD surface, ownership errors, and that the SKILL.md file
 * is materialized at ${projectDir}/.opencode/skills/<name>/SKILL.md on create
 * and removed on delete.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { readFile, access, rm } from "node:fs/promises"
import { join } from "node:path"
import { setup, teardown } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { projectSkillsRoutes } from "../src/skills/routes"
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

describe("skill create", () => {
  test("materializes SKILL.md at .opencode/skills/<name>/SKILL.md", async () => {
    const token = await registerUser("sk1", "sk1@example.com")
    const project = await createProject(token, "SkillProj1")

    const res = await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "my-skill",
        description: "Does a thing",
        content: "Step 1. Do the thing.",
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, any>
    expect(body.skill.name).toBe("my-skill")
    expect(body.skill.id).toMatch(/^skl_/)

    const skillPath = join(project.directory, ".opencode", "skills", "my-skill", "SKILL.md")
    const content = await readFile(skillPath, "utf-8")
    expect(content).toContain("name: my-skill")
    expect(content).toContain("description: Does a thing")
    expect(content).toContain("Step 1. Do the thing.")
  })

  test("rejects invalid name with 400", async () => {
    const token = await registerUser("sk2", "sk2@example.com")
    const project = await createProject(token, "SkillProj2")

    const res = await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "My_Skill",
        description: "x",
        content: "body",
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  test("rejects description >1024 with 400", async () => {
    const token = await registerUser("sk3", "sk3@example.com")
    const project = await createProject(token, "SkillProj3")

    const res = await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "longdesc",
        description: "a".repeat(1025),
        content: "body",
      }),
    )
    expect(res.status).toBe(400)
  })

  test("duplicate name in same project returns 400", async () => {
    const token = await registerUser("sk4", "sk4@example.com")
    const project = await createProject(token, "SkillProj4")

    await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "dup", description: "d", content: "body",
      }),
    )
    const res = await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "dup", description: "d2", content: "body2",
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe("skill ownership", () => {
  test("creating in another user's project returns 403", async () => {
    const tokenA = await registerUser("sk5a", "sk5a@example.com")
    const tokenB = await registerUser("sk5b", "sk5b@example.com")
    const projectA = await createProject(tokenA, "A Project")

    const res = await app.fetch(
      req("POST", `/api/platform/projects/${projectA.id}/skills`, tokenB, {
        name: "intruder", description: "d", content: "body",
      }),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Record<string, any>
    expect(body.error.code).toBe("FORBIDDEN")
  })

  test("missing project returns 404", async () => {
    const token = await registerUser("sk6", "sk6@example.com")
    const res = await app.fetch(
      req("POST", `/api/platform/projects/proj_nonexistent/skills`, token, {
        name: "ghost", description: "d", content: "body",
      }),
    )
    expect(res.status).toBe(404)
  })

  test("without auth returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/platform/projects/proj_x/skills"),
    )
    expect(res.status).toBe(401)
  })
})

describe("skill list / get / update / delete", () => {
  test("full CRUD happy path", async () => {
    const token = await registerUser("sk7", "sk7@example.com")
    const project = await createProject(token, "CrudProj")

    // create
    await app.fetch(
      req("POST", `/api/platform/projects/${project.id}/skills`, token, {
        name: "crud-skill", description: "orig", content: "orig body",
      }),
    )

    // list
    const listRes = await app.fetch(req("GET", `/api/platform/projects/${project.id}/skills`, token))
    expect(listRes.status).toBe(200)
    const listBody = (await listRes.json()) as Record<string, any>
    expect(listBody.skills.length).toBe(1)
    expect(listBody.skills[0].name).toBe("crud-skill")

    // get
    const getRes = await app.fetch(req("GET", `/api/platform/projects/${project.id}/skills/crud-skill`, token))
    expect(getRes.status).toBe(200)
    const getBody = (await getRes.json()) as Record<string, any>
    expect(getBody.skill.content).toBe("orig body")

    // update — rewrites SKILL.md
    const updRes = await app.fetch(
      req("PUT", `/api/platform/projects/${project.id}/skills/crud-skill`, token, {
        description: "updated", content: "new body",
      }),
    )
    expect(updRes.status).toBe(200)
    const skillPath = join(project.directory, ".opencode", "skills", "crud-skill", "SKILL.md")
    const fileAfterUpdate = await readFile(skillPath, "utf-8")
    expect(fileAfterUpdate).toContain("description: updated")
    expect(fileAfterUpdate).toContain("new body")

    // delete — removes both row and folder
    const delRes = await app.fetch(req("DELETE", `/api/platform/projects/${project.id}/skills/crud-skill`, token))
    expect(delRes.status).toBe(200)

    let removed = false
    try {
      await access(skillPath)
    } catch {
      removed = true
    }
    expect(removed).toBe(true)

    const listAfter = await app.fetch(req("GET", `/api/platform/projects/${project.id}/skills`, token))
    const listAfterBody = (await listAfter.json()) as Record<string, any>
    expect(listAfterBody.skills.length).toBe(0)
  })

  test("get / update / delete of missing skill returns 404", async () => {
    const token = await registerUser("sk8", "sk8@example.com")
    const project = await createProject(token, "MissingProj")

    expect((await app.fetch(req("GET", `/api/platform/projects/${project.id}/skills/nope`, token))).status).toBe(404)
    expect(
      (await app.fetch(req("PUT", `/api/platform/projects/${project.id}/skills/nope`, token, { content: "x" }))).status,
    ).toBe(404)
    expect((await app.fetch(req("DELETE", `/api/platform/projects/${project.id}/skills/nope`, token))).status).toBe(404)
  })
})
