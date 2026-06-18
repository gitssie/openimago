// Resolve a Cut clip's source media from the generation layer (openimago-4eiw).
//
// A clip references a `sourceShotId`; its playable media is the shot's latest
// COMPLETED run's preview URL (the rough-cut source). This is the URL-level
// descriptor — the browser then imports it via the fork's importFromUrl to get
// the omniclip content-hash/frames/duration. Pure: shots + runs in, descriptor
// out; unit-tested.

import type { StoryRunSummary, StoryShotSummary } from '../../components/session-workspace/types'

/** URL-level media for a source shot, before browser import. */
export interface ShotMediaSource {
  sourceShotId: string
  /** full-size media URL (omniclip clip source). */
  url: string
  /** thumbnail URL for quick display. */
  thumbnailUrl: string | null
  /** a stable, human name for the imported file. */
  name: string
}

/**
 * Pick the run that supplies a shot's media: the most recently completed run
 * for that shot that has a preview URL. Returns null when the shot has no
 * usable completed run (clip becomes an orphan placeholder on the timeline).
 */
export function resolveShotMediaSource(
  sourceShotId: string,
  shots: readonly StoryShotSummary[],
  runs: readonly StoryRunSummary[],
): ShotMediaSource | null {
  const shot = shots.find((s) => s.id === sourceShotId)
  if (!shot) return null

  const completed = runs
    .filter((r) => r.shotId === sourceShotId && r.status === 'completed' && r.previewUrl)
    // newest first: prefer the shot's latestRunId, else by completedAt desc
    .sort((a, b) => {
      if (a.id === shot.latestRunId) return -1
      if (b.id === shot.latestRunId) return 1
      return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
    })

  const run = completed[0]
  if (!run || !run.previewUrl) return null

  return {
    sourceShotId,
    url: run.previewUrl,
    thumbnailUrl: run.thumbnailUrl,
    name: `${sourceShotId}.mp4`,
  }
}

/** Build a resolver closure bound to the current shots/runs projections. */
export function makeShotMediaResolver(
  shots: readonly StoryShotSummary[],
  runs: readonly StoryRunSummary[],
): (sourceShotId: string) => ShotMediaSource | null {
  return (sourceShotId: string) => resolveShotMediaSource(sourceShotId, shots, runs)
}
