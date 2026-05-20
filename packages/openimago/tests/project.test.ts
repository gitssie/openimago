import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown, COS_BASE_PATH } from "./helper"
import { authRoutes } from "../src/auth/routes"
import { projectRoutes } from "../src/project/routes"
import { stat } from "node:fs/promises"

let app: Hono

async function registerUser(username: string, email: string): Promise<string> {
  const res = await app.fetch(
    new Request("http://localhost/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, email, password: "password123" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  return body.token as string
}

beforeAll(async () => {
  await setup()
  app = new Hono()
  app.route("/auth", authRoutes)
  app.route("/api/platform/projects", projectRoutes)
})

afterAll(async () => {
  await teardown()
})

// 1. User can create a project
test("user can create a project", async () => {
  const token = await registerUser("dev1", "dev1@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "My Project", description: "A test project" }),
    }),
  )
  expect(res.status).toBe(201)
  const body = await res.json() as Record<string, any>
  expect(body.project.name).toBe("My Project")
  expect(body.project.description).toBe("A test project")
  expect(body.project.id).toMatch(/^proj_/)
  expect(body.project.fullPath).toBe(`${COS_BASE_PATH}/${body.project.id}`)
  expect(body.project.status).toBe("active")
})

// 2. Creating a project creates the directory on disk
test("creating a project creates the directory on disk", async () => {
  const token = await registerUser("dev2", "dev2@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "DirCheck" }),
    }),
  )
  const body = await res.json() as Record<string, any>
  const dirStat = await stat(body.project.fullPath)
  expect(dirStat.isDirectory()).toBe(true)
})

// 3. Creating a project inserts a work_dirs record
test("creating a project inserts a work_dirs record", async () => {
  const token = await registerUser("dev3", "dev3@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "WorkDirCheck" }),
    }),
  )
  const body = await res.json() as Record<string, any>

  const wdRes = await app.fetch(
    new Request(`http://localhost/api/platform/projects`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  const wdBody = (await wdRes.json()) as any
  const project = wdBody.projects.find((p: any) => p.id === body.project.id)
  expect(project).toBeDefined()
})

// 4. User can list own projects
test("user can list own projects", async () => {
  const token = await registerUser("dev4", "dev4@example.com")

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Project A" }),
    }),
  )
  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "Project B" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${token}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.projects.length).toBe(2)
  expect(body.projects[0].name).toBe("Project B") // DESC order
  expect(body.projects[1].name).toBe("Project A")
})

// 5. User cannot see other user's projects
test("user cannot see other users projects", async () => {
  const tokenA = await registerUser("deva", "deva@example.com")
  const tokenB = await registerUser("devb", "devb@example.com")

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: "A's Project" }),
    }),
  )

  await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ name: "B's Project" }),
    }),
  )

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      headers: { authorization: `Bearer ${tokenA}` },
    }),
  )
  const body = (await res.json()) as any
  expect(body.projects.length).toBe(1)
  expect(body.projects[0].name).toBe("A's Project")
})

// 6. Archiving a project sets status
test("archiving a project sets status", async () => {
  const token = await registerUser("dev6", "dev6@example.com")

  const create = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "ToArchive" }),
    }),
  )
  const { project } = await create.json() as any

  const res = await app.fetch(
    new Request(`http://localhost/api/platform/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "archived" }),
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.project.status).toBe("archived")
})

// 7. Creating project with empty name returns 400
test("creating project with empty name returns 400", async () => {
  const token = await registerUser("dev7", "dev7@example.com")

  const res = await app.fetch(
    new Request("http://localhost/api/platform/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: "" }),
    }),
  )
  expect(res.status).toBe(400)
})
