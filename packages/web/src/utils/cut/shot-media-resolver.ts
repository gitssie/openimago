// Resolve a Cut clip's source media from the generation layer (openimago-4eiw).
//
// A clip references a `sourceShotId`; its playable media is the shot's latest
// COMPLETED run's preview URL (the rough-cut source). This is the URL-level
// descriptor — the browser then imports it via the fork's importFromUrl to get
// the omniclip content-hash/frames/duration. Pure: shots + runs in, descriptor
// out; unit-tested.

import type { StoryRunSummary, StoryShotSummary } from '../../components/session-workspace/types'

/**
 * Precomputed timeline filmstrip sprite for a clip (openimago-78m9, value object
 * openimago-wa33). A self-consistent bundle: the sprite URL, its frame count and
 * per-frame px dims, and the SOURCE duration the cell-time→frame mapping is
 * computed against — all taken TOGETHER from the run that produced the sprite, so
 * they can never drift apart. Either the whole object is present, or `filmstrip`
 * is null (no sprite); the individual fields are never independently null.
 *
 * `sourceDurationMs` is the integer-ms source duration OF THE SPRITE'S run (cut
 * schema v2 unit, openimago-23cr) — used ONLY for sprite frame mapping (which
 * frame of the sprite a cell's source time lands on). It is deliberately
 * separate from ShotMediaSource.sourceDurationMs (the PLAYBACK run's duration),
 * which may come from a different run and is what bounds trim.
 */
export interface Filmstrip {
  spriteUrl: string
  frameCount: number
  frameW: number
  frameH: number
  sourceDurationMs: number
}

/** URL-level media for a source shot, before browser import. */
export interface ShotMediaSource {
  sourceShotId: string
  /** full-size media URL (omniclip clip source). */
  url: string
  /** thumbnail URL for quick display. */
  thumbnailUrl: string | null
  /** Precomputed filmstrip sprite (sprite + dims + its own source duration),
   *  whole-or-null. null when no completed run of the shot has a sprite. */
  filmstrip: Filmstrip | null
  /** Real SOURCE video duration in integer ms of the PLAYBACK run (the run whose
   *  media actually plays) — this is what a clip's trim is bounded against, so it
   *  MUST come from the primary/playback run, NOT the (possibly different)
   *  filmstrip run (openimago-wa33). null when the playback run has no duration. */
  sourceDurationMs: number | null
  /** a stable, human name for the imported file. */
  name: string
}

const MS_PER_S = 1000

/** Whole ms from a run's seconds duration, or null when absent/non-finite. */
function runDurationMs(durationSeconds: number | null): number | null {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) return null
  return Math.round(durationSeconds * MS_PER_S)
}

/**
 * Build the Filmstrip VO from the run that owns the sprite — whole-or-null. The
 * sprite needs all four image facts AND a source duration to map cell-time →
 * frame; if any is missing the strip is simply absent (the clip falls back to a
 * flat lane) rather than half-built.
 */
function buildFilmstrip(run: StoryRunSummary): Filmstrip | null {
  if (
    !run.filmstripUrl ||
    run.filmstripFrameCount === null ||
    run.filmstripFrameW === null ||
    run.filmstripFrameH === null
  ) {
    return null
  }
  const sourceDurationMs = runDurationMs(run.durationSeconds)
  if (sourceDurationMs === null) return null
  return {
    spriteUrl: run.filmstripUrl,
    frameCount: run.filmstripFrameCount,
    frameW: run.filmstripFrameW,
    frameH: run.filmstripFrameH,
    sourceDurationMs,
  }
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
 * The filmstrip fields are taken TOGETHER from filmstripRun (as the Filmstrip VO) so
 * the sprite, its frame dims, and the source duration that maps cell-time → frame
 * stay self-consistent. The thumbnail therefore survives as long as ANY completed run
 * of the shot has a sprite.
 *
 * sourceDurationMs (openimago-wa33): the clip's PLAYBACK duration — what trim is
 * bounded against — MUST come from `primary` (the run whose media plays), NOT from
 * filmstripRun. These can be DIFFERENT runs (a fallback sprite from an older run of a
 * different length); taking the duration from the sprite run made trim bounds
 * disagree with the actual playing media. The sprite's own source duration lives on
 * the Filmstrip VO and is used only for frame mapping.
 *
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
    // The sprite (+ dims + its own source duration) TOGETHER from filmstripRun.
    filmstrip: buildFilmstrip(filmstripRun),
    // PLAYBACK duration from `primary` (the run whose media plays), so trim bounds
    // match the actual clip — not the (possibly different) filmstripRun.
    sourceDurationMs: runDurationMs(primary.durationSeconds),
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
