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

// 3. Health check normalizes a 0.0.0.0 upstream URL so it can connect.
//    A 0.0.0.0 fetch target is unroutable; normalization rewrites it to
//    127.0.0.1, where our stub /global/health server actually listens.
test("health check normalizes 0.0.0.0 upstream to a routable loopback", async () => {
  const stub = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/global/health") {
        return new Response("ok", { status: 200 })
      }
      return new Response("not found", { status: 404 })
    },
  })

  try {
    const routes = createHealthRoutes({
      opencodeUrl: `http://0.0.0.0:${stub.port}`,
    })
    const app000 = new Hono()
    app000.route("/", routes)

    const res = await app000.fetch(new Request("http://localhost/health"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, any>
    expect(body.opencode).toBe("connected")
  } finally {
    stub.stop(true)
  }
})
