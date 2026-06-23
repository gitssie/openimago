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
  /** Precomputed filmstrip sprite URL for the timeline strip (openimago-78m9),
   *  or null when the run has no sprite. */
  filmstripUrl: string | null
  /** Sprite frame count / per-frame px dims (null when no sprite). */
  filmstripFrameCount: number | null
  filmstripFrameW: number | null
  filmstripFrameH: number | null
  /** Real SOURCE video duration in seconds (run.result.duration) — the basis for
   *  mapping a cell's source time → sprite frame (openimago-px5g). null if unknown. */
  sourceDurationSeconds: number | null
  /** a stable, human name for the imported file. */
  name: string
}

/**
 * Pick the run that supplies a Cut clip's media. A clip lives on the VIDEO track,
 * so its source must be the shot's VIDEO run — NOT merely the latest completed run
 * (a shot can also have image-concept and audio/narration runs that complete later
 * and carry a previewUrl but no video and no filmstrip sprite; openimago-78m9).
 * Selection priority among the shot's completed runs with a previewUrl:
 *   1. the most-recent VIDEO run (kind==='video') — the right clip source AND the
 *      one carrying the precomputed filmstrip sprite,
 *   2. else any run that has a filmstripUrl (defensive),
 *   3. else the most-recent completed run (legacy fallback; e.g. video-less shots).
 * Returns null when the shot has no usable completed run (orphan placeholder).
 */
export function resolveShotMediaSource(
  sourceShotId: string,
  shots: readonly StoryShotSummary[],
  runs: readonly StoryRunSummary[],
): ShotMediaSource | null {
  const shot = shots.find((s) => s.id === sourceShotId)
  if (!shot) return null

  // newest first: prefer the shot's latestRunId, else by completedAt desc.
  const byRecency = (a: StoryRunSummary, b: StoryRunSummary) => {
    if (a.id === shot.latestRunId) return -1
    if (b.id === shot.latestRunId) return 1
    return (b.completedAt ?? '').localeCompare(a.completedAt ?? '')
  }
  const completed = runs
    .filter((r) => r.shotId === sourceShotId && r.status === 'completed' && r.previewUrl)
    .sort(byRecency)

  const run =
    completed.find((r) => r.kind === 'video') ??
    completed.find((r) => Boolean(r.filmstripUrl)) ??
    completed[0]
  if (!run || !run.previewUrl) return null

  return {
    sourceShotId,
    url: run.previewUrl,
    thumbnailUrl: run.thumbnailUrl,
    filmstripUrl: run.filmstripUrl,
    filmstripFrameCount: run.filmstripFrameCount,
    filmstripFrameW: run.filmstripFrameW,
    filmstripFrameH: run.filmstripFrameH,
    sourceDurationSeconds: run.durationSeconds,
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
