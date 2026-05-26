import { Context, Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { workspaceRefs } from "../db/schema"
import { logger } from "../server/logger"

// ─── Testable factory ─────────────────────────────────────────────────────────

export interface WorkspaceResolverService {
  /** Look up the userId that owns a given workspaceId. Returns null if unmapped. */
  readonly ownerOf: (workspaceId: string) => Effect.Effect<string | null>
}

/**
 * Factory exposed for unit testing.
 * Accepts an injectable lookup function so tests can provide a mock DB.
 */
export function makeWorkspaceResolver(
  lookup: (workspaceId: string) => Promise<string | null>,
): WorkspaceResolverService {
  // Simple in-memory Map cache (no TTL needed — workspace→user mapping is stable)
  const cache = new Map<string, string | null>()

  return {
    ownerOf: (workspaceId: string) =>
      Effect.gen(function* () {
        if (cache.has(workspaceId)) {
          const cached = cache.get(workspaceId) ?? null
          return cached
        }
        const result = yield* Effect.promise(() => lookup(workspaceId))
        cache.set(workspaceId, result)
        return result
      }),
  }
}

// ─── Service tag ──────────────────────────────────────────────────────────────

export class WorkspaceResolver extends Context.Tag("@openimago/WorkspaceResolver")<
  WorkspaceResolver,
  WorkspaceResolverService
>() {}

// ─── Live Layer ───────────────────────────────────────────────────────────────

export const WorkspaceResolverLive = Layer.effect(
  WorkspaceResolver,
  Effect.gen(function* () {
    return makeWorkspaceResolver(async (workspaceId: string) => {
      const rows = await db
        .select({ userId: workspaceRefs.userId })
        .from(workspaceRefs)
        .where(eq(workspaceRefs.workspaceId, workspaceId))
        .limit(1)
      return rows[0]?.userId ?? null
    })
  }),
)
