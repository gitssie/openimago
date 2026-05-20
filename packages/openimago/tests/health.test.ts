import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { Hono } from "hono"
import { setup, teardown } from "./helper"
import { createHealthRoutes } from "../src/health/routes"

let app: Hono

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096"

beforeAll(async () => {
  await setup()
  const routes = createHealthRoutes({ opencodeUrl: OPENCODE_URL })
  app = new Hono()
  app.route("/", routes)
})

afterAll(async () => {
  await teardown()
})

// 1. Health check returns ok when real OpenCode is up
test("health check returns ok when OpenCode is connected", async () => {
  const res = await app.fetch(
    new Request("http://localhost/health"),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any> as any
  expect(body.status).toBe("ok")
  expect(body.db).toBeDefined()
  expect(body.opencode).toBeDefined()
  expect(body.uptime).toBeDefined()
  expect(typeof body.uptime).toBe("number")
})

// 2. Health check detects OpenCode down
test("health check detects OpenCode down", async () => {
  const routes = createHealthRoutes({ opencodeUrl: "http://localhost:19999" })
  const badApp = new Hono()
  badApp.route("/", routes)

  const res = await badApp.fetch(
    new Request("http://localhost/health"),
  )
  expect(res.status).toBe(200)
  const body = await res.json() as Record<string, any> as any
  expect(body.status).toBe("ok")
  expect(body.opencode).toBe("disconnected")
})
