// Bidirectional EpisodeCut <-> omniclip-state mapper (ADR 0007 ownership model A,
// openimago-4eiw). Promoted from the spike (openimago-2re7). Pure: no omniclip /
// DOM imports, so it is fully unit-tested.
//
// UNITS (cut schema v2, openimago-23cr): EpisodeCut clip trim points
// (inPointMs/outPointMs) and omniclip effect fields (start/end/duration/
// start_at_position) are BOTH integer ms, so the clip<->effect mapping is a
// direct pass-through — no ×1000/÷1000, no float drift, strictly reversible.
// The only seconds value left is the source media's raw duration (a SECONDS
// fact from the run), converted once for omniclip's raw_duration (ms).

import type { CutClip, EpisodeCut, ResolvedShotMedia } from './cut-types'
import type {
  OmniAnyEffect,
  OmniHistoricalState,
  OmniVideoEffect,
} from './omniclip-state.types'

/** Whole ms per second — only for the source raw-duration seconds→ms conversion. */
const MS_PER_S = 1000

/** Stable default rect — clips fill the portrait 9:16 frame (openimago-vm5v);
 * trimming happens via in/out. Matches the 1080×1920 project resolution. */
function fullFrameRect(): OmniVideoEffect['rect'] {
  return {
    width: 1080,
    height: 1920,
    scaleX: 1,
    scaleY: 1,
    position_on_canvas: { x: 0, y: 0 },
    rotation: 0,
  }
}

export interface HydrateResult {
  state: OmniHistoricalState
  /** clips whose sourceShotId could not be resolved (greyed placeholders). */
  orphans: CutClip[]
}

/**
 * Hydrate omniclip state from a canonical EpisodeCut. Lays clips end-to-end on
 * track 0 in `order`, honouring per-clip trim. A clip whose source can't be
 * resolved (deleted Shot) is returned as an orphan (ADR 0006: tolerate, never
 * drop — the panel renders it via the fork's data-no-file path).
 */
export function cutToOmniclipState(
  cut: EpisodeCut,
  resolveMedia: (sourceShotId: string) => ResolvedShotMedia | undefined,
): HydrateResult {
  const ordered = [...cut.clips].sort((a, b) => a.order - b.order)
  const effects: OmniAnyEffect[] = []
  const orphans: CutClip[] = []

  let cursorMs = 0
  for (const clip of ordered) {
    const media = resolveMedia(clip.sourceShotId)
    const startMs = clip.inPointMs
    const endMs = clip.outPointMs
    const durationMs = endMs - startMs

    if (!media) {
      orphans.push(clip)
      cursorMs += durationMs
      continue
    }

    effects.push({
      kind: 'video',
      id: clip.id, // reuse CutClip.id so the round-trip is identity-stable
      start_at_position: cursorMs,
      duration: durationMs,
      start: startMs,
      end: endMs,
      track: 0,
      file_hash: media.fileHash,
      name: media.name,
      thumbnail: media.thumbnail,
      raw_duration: media.rawDurationSeconds * MS_PER_S,
      frames: media.frames,
      rect: fullFrameRect(),
    })
    cursorMs += durationMs
  }

  return { state: { effects, tracks: [{ id: 'track-0' }] }, orphans }
}

/**
 * Read omniclip state back into a canonical EpisodeCut. Video effects ordered by
 * on-track position become clips; the first audio effect maps to the single BGM
 * bed. Transitions are persisted through the dedicated cut/transitions endpoints
 * (not the omniclip full-state readback), so they are carried over from
 * `previous` here.
 */
export function omniclipStateToCut(
  state: OmniHistoricalState,
  previous: Pick<EpisodeCut, 'schemaVersion' | 'episodeId' | 'transitions'>,
  resolveSourceShotId: (fileHash: string) => string | undefined,
  nowIso: string,
): EpisodeCut {
  const videoEffects = state.effects
    .filter((e): e is OmniVideoEffect => e.kind === 'video')
    .sort((a, b) => a.start_at_position - b.start_at_position)

  const clips: CutClip[] = videoEffects.map((effect, index) => ({
    id: effect.id,
    sourceShotId: resolveSourceShotId(effect.file_hash) ?? effect.file_hash,
    inPointMs: effect.start,
    outPointMs: effect.end,
    order: index,
  }))

  const firstAudio = state.effects.find((e) => e.kind === 'audio')

  const cut: EpisodeCut = {
    schemaVersion: previous.schemaVersion,
    episodeId: previous.episodeId,
    clips,
    transitions: previous.transitions,
    updatedAt: nowIso,
  }
  if (firstAudio) {
    cut.bgm = { artifactId: resolveSourceShotId(firstAudio.file_hash) ?? firstAudio.file_hash }
  }
  return cut
}
