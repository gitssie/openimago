// Cut write lifecycle (ADR 0006/0005, openimago-4eiw).
//
// A Cut has its OWN optimistic-concurrency clock (separate cut.json), so cut
// writes carry the cut's `updatedAt` — NOT the episode's. This mirrors the
// episode-level runShotMutation pattern in ProjectWorkspacePage, but keyed on
// the cut. Pure + injectable (no Vue/api import) so it is unit-tested:
// `mutate(expectedUpdatedAt)` does one API call; on a 409 we refetch the cut and
// retry once with the fresh updatedAt; a second 409 is reported as a conflict.

/** Minimal shape of the ApiError this module reacts to (avoids a hard import). */
export interface ConflictDetectable {
  status?: number
}

export function isConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as ConflictDetectable).status === 409
  )
}

export type CutMutationOutcome = 'ok' | 'conflict'

export interface RunCutMutationDeps {
  /** current cut's last-read updatedAt (undefined when never cut / unknown). */
  currentUpdatedAt: () => string | undefined
  /** refetch the cut, returning its fresh updatedAt (undefined if none). */
  refetch: () => Promise<string | undefined>
  /** perform ONE write with the given expectedUpdatedAt. */
  mutate: (expectedUpdatedAt: string | undefined) => Promise<unknown>
  /**
   * Notified with the successful write's returned `updatedAt`, so the caller can
   * advance its local optimistic-concurrency clock without an extra refetch
   * (ADR 0008 #3). Not called on conflict.
   */
  onWritten?: (updatedAt: string) => void
}

/** Read an `updatedAt` off a write result, if present. */
function updatedAtOf(result: unknown): string | undefined {
  if (typeof result === 'object' && result !== null && 'updatedAt' in result) {
    const value = result.updatedAt
    if (typeof value === 'string') return value
  }
  return undefined
}

/**
 * Run a single cut write with refetch-and-retry-once on 409.
 * Returns 'ok' on success, 'conflict' if it still loses after one retry.
 * Non-409 errors propagate to the caller.
 */
export async function runCutMutation(deps: RunCutMutationDeps): Promise<CutMutationOutcome> {
  let expectedUpdatedAt = deps.currentUpdatedAt()
  try {
    const result = await deps.mutate(expectedUpdatedAt)
    const updatedAt = updatedAtOf(result)
    if (updatedAt !== undefined) deps.onWritten?.(updatedAt)
    return 'ok'
  } catch (err) {
    if (!isConflict(err)) throw err
    // Stale read — refetch the cut, retry once with the latest updatedAt.
    expectedUpdatedAt = await deps.refetch()
    try {
      const result = await deps.mutate(expectedUpdatedAt)
      const updatedAt = updatedAtOf(result)
      if (updatedAt !== undefined) deps.onWritten?.(updatedAt)
      return 'ok'
    } catch (retryErr) {
      if (isConflict(retryErr)) return 'conflict'
      throw retryErr
    }
  }
}
