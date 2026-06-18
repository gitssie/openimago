// THROWAWAY SPIKE — openimago-2re7 (ADR 0007, spike point 3).
// Delete with the `_spike/omniclip/` dir.
//
// PROOF OF CONCEPT for the bidirectional mapping that the "A" ownership model
// (cut.json canonical) requires. This compiles and is unit-tested
// (`cut-omniclip.mapper.spec.ts`) to prove the round-trip is lossless for the
// fields our schema owns. It is intentionally pure (no omniclip import, no DOM)
// so the gate decision does not depend on installing a 67 MB package.
//
// KEY UNIT MISMATCH discovered during the spike:
//   - EpisodeCut works in SECONDS (inPoint/outPoint).
//   - omniclip effects work in MILLISECONDS (start/end/duration/start_at_position).
// The mapper is the single place this conversion lives.

import type { CutClip, EpisodeCut, ResolvedShotMedia } from './episode-cut.types'
import type {
  OmniAnyEffect,
  OmniHistoricalState,
  OmniVideoEffect,
} from './omniclip-state.types'

const MS_PER_S = 1000

/** Stable default rect — clips fill the 16:9 frame; trimming happens via in/out. */
function fullFrameRect(): OmniVideoEffect['rect'] {
  return {
    width: 1920,
    height: 1080,
    scaleX: 1,
    scaleY: 1,
    position_on_canvas: { x: 0, y: 0 },
    rotation: 0,
  }
}

// ─── HYDRATE: EpisodeCut -> omniclip state ─────────────────────────────────────
//
// Lays clips end-to-end on track 0 in `order`, honouring per-clip trim.
// `resolveMedia` returns the import-derived facts (hash/frames/duration/thumb);
// a clip whose source can't be resolved (deleted Shot) becomes an orphan
// placeholder — ADR 0006 says we MUST tolerate, never drop, these.

export interface HydrateResult {
  state: OmniHistoricalState
  /** clips whose sourceShotId could not be resolved (greyed placeholders). */
  orphans: CutClip[]
}

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
    const startMs = clip.inPoint * MS_PER_S
    const endMs = clip.outPoint * MS_PER_S
    const durationMs = endMs - startMs

    if (!media) {
      // Orphan: keep its slot/length so the timeline still shows it greyed.
      orphans.push(clip)
      cursorMs += durationMs
      continue
    }

    const effect: OmniVideoEffect = {
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
    }
    effects.push(effect)
    cursorMs += durationMs
  }

  return {
    state: { effects, tracks: [{ id: 'track-0' }] },
    orphans,
  }
}

// ─── READ BACK: omniclip state -> EpisodeCut ───────────────────────────────────
//
// Reads the video track, sorts by on-track position, derives `order` and
// in/out points. Audio effects map to BGM (first audio effect only — our schema
// has a single bgm bed). Transitions are NOT representable as omniclip "effects"
// in 1.0.7 (no transition primitive in the state tree), so they are preserved
// from the previous cut.json rather than read back — a documented gap.

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
    inPoint: effect.start / MS_PER_S,
    outPoint: effect.end / MS_PER_S,
    order: index,
  }))

  const firstAudio = state.effects.find((e) => e.kind === 'audio')

  const cut: EpisodeCut = {
    schemaVersion: previous.schemaVersion,
    episodeId: previous.episodeId,
    clips,
    // transitions survive from the canonical file — omniclip 1.0.7 has no
    // transition primitive in its state tree to read back from.
    transitions: previous.transitions,
    updatedAt: nowIso,
  }
  if (firstAudio) {
    cut.bgm = {
      artifactId: resolveSourceShotId(firstAudio.file_hash) ?? firstAudio.file_hash,
    }
  }
  return cut
}
