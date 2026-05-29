import { Context, Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { db } from "../db/client"
import { users } from "../db/schema"
import { WorkspaceTable } from "../db/workspace-schema"

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
  /** Positive hits: workspace → { userId, expiresAt }. TTL prevents stale entries after DB resets. */
  const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
  const cache = new Map<string, { userId: string; expiresAt: number }>()

  return {
    ownerOf: (workspaceId: string) =>
      Effect.gen(function* () {
        const now = Date.now()
        const entry = cache.get(workspaceId)
        if (entry && entry.expiresAt > now) {
          return entry.userId
        }
        // Evict stale entry if present
        if (entry) cache.delete(workspaceId)

        const result = yield* Effect.promise(() => lookup(workspaceId))
        if (result) cache.set(workspaceId, { userId: result, expiresAt: now + CACHE_TTL_MS })
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
      const workspaceRows = await db
        .select({ userId: WorkspaceTable.userId })
        .from(WorkspaceTable)
        .where(eq(WorkspaceTable.id, workspaceId))
        .limit(1)
      if (workspaceRows[0]?.userId) return workspaceRows[0].userId

      const userRows = await db
        .select({ userId: users.id })
        .from(users)
        .where(eq(users.workspaceId, workspaceId))
        .limit(1)
      return userRows[0]?.userId ?? null
    })
  }),
)
