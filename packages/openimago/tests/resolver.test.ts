/**
 * Tests for WorkspaceResolver — cache + DB lookup behavior.
 *
 * Behaviors tested through the public ownerOf() interface:
 *   1. Returns userId when workspace_refs row exists
 *   2. Returns null when workspace_refs row does not exist
 *   3. Caches the result (DB is not queried a second time for same workspaceId)
 */
import { describe, test, expect, mock } from "bun:test"
import { Effect, Layer } from "effect"

// We inject a fake DB to avoid needing a real database in unit tests.
// The resolver's public interface is ownerOf(workspaceId) → Effect<string | null>.

// We test by building the resolver with a mock DB lookup function.
import { makeWorkspaceResolver } from "../src/event/resolver"

describe("WorkspaceResolver", () => {
  test("returns userId when mapping exists", async () => {
    let callCount = 0
    const mockLookup = async (workspaceId: string): Promise<string | null> => {
      callCount++
      if (workspaceId === "wrk_abc") return "user_123"
      return null
    }

    const resolver = makeWorkspaceResolver(mockLookup)

    const result = await Effect.runPromise(
      Effect.scoped(resolver.ownerOf("wrk_abc")),
    )

    expect(result).toBe("user_123")
    expect(callCount).toBe(1)
  })

  test("returns null when workspace has no mapping", async () => {
    const mockLookup = async (_workspaceId: string): Promise<string | null> => null

    const resolver = makeWorkspaceResolver(mockLookup)

    const result = await Effect.runPromise(
      Effect.scoped(resolver.ownerOf("wrk_unknown")),
    )

    expect(result).toBeNull()
  })

  test("caches result — DB not queried twice for same workspaceId", async () => {
    let callCount = 0
    const mockLookup = async (workspaceId: string): Promise<string | null> => {
      callCount++
      return workspaceId === "wrk_cached" ? "user_456" : null
    }

    const resolver = makeWorkspaceResolver(mockLookup)

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const r1 = yield* resolver.ownerOf("wrk_cached")
          const r2 = yield* resolver.ownerOf("wrk_cached")
          expect(r1).toBe("user_456")
          expect(r2).toBe("user_456")
        }),
      ),
    )

    // DB should only be queried once due to caching
    expect(callCount).toBe(1)
  })
})
