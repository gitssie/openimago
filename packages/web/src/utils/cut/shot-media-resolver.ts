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
 * Pick the runs that supply a Cut clip's media. A clip lives on the VIDEO track,
 * so its PLAYBACK source must be the shot's VIDEO run — NOT merely the latest
 * completed run (a shot can also have image-concept and audio/narration runs that
 * complete later and carry a previewUrl but no video; openimago-78m9).
 *
 * The PREVIEW run and the FILMSTRIP run are resolved INDEPENDENTLY (openimago-iiab):
 * the filmstrip sprite is re-resolved every hydration (CutClip stores no filmstrip),
 * and coupling it to the preview/video run meant that when the NEWEST video run had
 * no sprite yet, the clip's thumbnail went blank — even though an OLDER completed run
 * of the same shot had a sprite. So:
 *   • primary (preview/thumbnail/playback) = most-recent VIDEO run ?? most-recent
 *     completed run (legacy fallback for video-less shots),
 *   • filmstripRun (sprite + its consistent dims + source duration) = the most-recent
 *     completed run that HAS a filmstripUrl ?? primary.
 * The filmstrip fields are taken TOGETHER from filmstripRun so the sprite, its frame
 * dims, and the sourceDurationSeconds that maps cell-time → frame stay self-consistent.
 * The thumbnail therefore survives as long as ANY completed run of the shot has a
 * sprite. Returns null when the shot has no usable completed run (orphan placeholder).
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

  // PLAYBACK source: the video run (clip is on the video track), else the most-recent
  // completed run (video-less shots).
  const primary = completed.find((r) => r.kind === 'video') ?? completed[0]
  if (!primary || !primary.previewUrl) return null

  // FILMSTRIP source: the most-recent completed run that actually has a sprite,
  // decoupled from `primary` so the strip survives even when primary has none yet.
  const filmstripRun = completed.find((r) => Boolean(r.filmstripUrl)) ?? primary

  return {
    sourceShotId,
    url: primary.previewUrl,
    thumbnailUrl: primary.thumbnailUrl,
    // All filmstrip-consistent fields TOGETHER from filmstripRun (sprite + its dims +
    // the source duration the cell-time→frame mapping needs for that sprite).
    filmstripUrl: filmstripRun.filmstripUrl,
    filmstripFrameCount: filmstripRun.filmstripFrameCount,
    filmstripFrameW: filmstripRun.filmstripFrameW,
    filmstripFrameH: filmstripRun.filmstripFrameH,
    sourceDurationSeconds: filmstripRun.durationSeconds,
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
