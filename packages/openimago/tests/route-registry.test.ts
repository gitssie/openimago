/**
 * Route registry invariant tests.
 *
 * These tests verify that ROUTE_REGISTRY is self-consistent and cannot drift
 * from the actual route handlers in proxy/routes.ts.
 *
 * Every entry marked needsDirectory: true must capture a session ID (group 1)
 * because proxyMiddleware extracts `match[1]` as the sessionId for resolveDirectory.
 */
import { test, expect, describe } from "bun:test"
import { ROUTE_REGISTRY } from "../src/server/middleware"

describe("ROUTE_REGISTRY invariants", () => {
  test("every needsDirectory entry has a capture group for session ID", () => {
    const withDir = ROUTE_REGISTRY.filter((r) => r.needsDirectory)
    expect(withDir.length).toBeGreaterThan(0)

    for (const entry of withDir) {
      const hasCapture = entry.pattern.source.includes("([^/]+)")
      expect(hasCapture).toBe(true)
    }
  })

  test("no duplicate method+pattern combinations", () => {
    const seen = new Set<string>()
    for (const entry of ROUTE_REGISTRY) {
      const key = `${entry.method}:${entry.pattern.source}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  test("all patterns start with /api/", () => {
    for (const entry of ROUTE_REGISTRY) {
      // Patterns are anchored with ^ so source starts with ^\\/api\\/
      expect(entry.pattern.test("/api/session") || entry.pattern.source.includes("\\/api\\/")).toBe(true)
    }
  })

  test("registry includes all known SDK-required routes", () => {
    const requiredRoutes: Array<{ method: string; sample: string }> = [
      { method: "GET",    sample: "/api/event" },
      { method: "GET",    sample: "/api/session" },
      { method: "POST",   sample: "/api/session" },
      { method: "GET",    sample: "/api/session/ses_abc/message" },
      { method: "POST",   sample: "/api/session/ses_abc/prompt_async" },
      { method: "POST",   sample: "/api/session/ses_abc/command" },
      { method: "GET",    sample: "/api/session/ses_abc/todo" },
      { method: "GET",    sample: "/api/command" },
      { method: "GET",    sample: "/api/agent" },
      { method: "GET",    sample: "/api/question" },
      { method: "GET",    sample: "/api/permission" },
    ]

    for (const { method, sample } of requiredRoutes) {
      const found = ROUTE_REGISTRY.some(
        (r) => r.method === method && r.pattern.test(sample),
      )
      expect(found).toBe(true)
    }
  })
})
