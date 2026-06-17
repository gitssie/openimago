/**
 * Timeline view helpers (openimago-upsf).
 *
 * Pure resolution of a workflow node's latest-run status against the run
 * history, used by StoryTimelinePanel to colour the node status dot.
 */
import type { StoryRunSummary } from '../components/session-workspace/types'

/** Status of a node's latest run, or 'none' when it has never run. */
export type LatestRunStatus = StoryRunSummary['status'] | 'none'

/**
 * Resolve the status of `latestRunId` within `runs`. Returns 'none' when the
 * node has no recorded run, or when the referenced run is absent from `runs`
 * (e.g. trimmed history) — both render as a neutral dot.
 */
export function resolveLatestRunStatus(
  latestRunId: string | null,
  runs: ReadonlyArray<StoryRunSummary>,
): LatestRunStatus {
  if (!latestRunId) return 'none'
  const run = runs.find((r) => r.id === latestRunId)
  return run ? run.status : 'none'
}
