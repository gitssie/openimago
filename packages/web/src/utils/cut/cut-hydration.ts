// Build the fork hydration payload from a canonical EpisodeCut (openimago-addv).
//
// Pure: maps cut.json clips (ordered) + a media resolver → the HydrateClip[]
// the fork's hydrateFromCut consumes, plus the transitions converted to omniclip
// ms and keyed by the clip id they follow. Orphan clips (no resolvable media)
// are split out so the host can surface them via the data-no-file path rather
// than feeding a urless clip to the importer. Unit-tested headless.
//
// UNIT BOUNDARY (openimago-23cr): the domain EpisodeCut is integer ms, but the
// fork HydrateClip contract is in SECONDS (it also carries seconds-based
// filmstrip facts), so clip trim points are converted ms→seconds HERE — the one
// place this conversion lives, mirroring the transition seconds→ms conversion
// below. The fork remultiplies by 1000 internally for omniclip placement.

import type { CutClip, EpisodeCut } from './cut-types'
import type { HydrateBgm, HydrateClip, HydrateFilmstrip, OmniTransition } from './fork-contract'
import type { Filmstrip, ShotMediaSource } from './shot-media-resolver'
import { clampClipRange } from './clamp-clip-range'

const MS_PER_S = 1000

/** URL-level media for the Cut's BGM artifact, before browser import. The host
 *  resolves this from the audio asset (its servable url + a display name). The
 *  optional `headers` carry auth for the authed /api/.../download fetch
 *  (openimago-tc8t) — the host supplies `Authorization: Bearer <token>`. */
export interface BgmMediaSource {
  url: string
  name: string
  headers?: Record<string, string>
}

export interface HydrationPayload {
  /** clips with resolvable media, in cut order — fed to the fork. */
  clips: HydrateClip[]
  /** transitions (omniclip ms) keyed by the clip they follow. */
  transitions: OmniTransition[]
  /** clips whose source media is gone — rendered as orphan placeholders. */
  orphans: CutClip[]
  /** the Cut's BGM bed for its own audio track — omitted when the cut has no
   *  bgm, or when the artifact can't be resolved to a url (openimago-w5bu). */
  bgm?: HydrateBgm
}

export function buildHydrationPayload(
  cut: EpisodeCut,
  resolveMedia: (sourceShotId: string) => ShotMediaSource | null,
  resolveBgm?: (artifactId: string) => BgmMediaSource | null,
): HydrationPayload {
  const ordered = [...cut.clips].sort((a, b) => a.order - b.order)
  const clips: HydrateClip[] = []
  const orphans: CutClip[] = []
  const liveClipIds = new Set<string>()

  for (const clip of ordered) {
    const media = resolveMedia(clip.sourceShotId)
    if (!media) {
      orphans.push(clip)
      continue
    }
    liveClipIds.add(clip.id)
    // Clamp the clip's range into [0, sourceDurationMs] so legacy/corrupt data
    // still hydrates (openimago-lknv). Silent clamp + warn — never block a load.
    const { inPointMs, outPointMs, clamped } = clampClipRange(
      clip.inPointMs,
      clip.outPointMs,
      clip.sourceDurationMs,
    )
    if (clamped) {
      console.warn('cut-hydration: clip range clamped to source bounds', {
        clipId: clip.id,
        requested: { inPointMs: clip.inPointMs, outPointMs: clip.outPointMs },
        sourceDurationMs: clip.sourceDurationMs,
        clamped: { inPointMs, outPointMs },
      })
    }
    clips.push({
      id: clip.id,
      url: media.url,
      name: media.name,
      inPointSeconds: inPointMs / MS_PER_S,
      outPointSeconds: outPointMs / MS_PER_S,
      filmstrip: toHydrateFilmstrip(media.filmstrip),
    })
  }

  // Only carry transitions whose anchor clip is actually on the timeline (a
  // transition after an orphaned/absent clip has nothing to play between).
  const transitions: OmniTransition[] = cut.transitions
    .filter((tr) => liveClipIds.has(tr.afterClipId))
    .map((tr) => ({
      afterEffectId: tr.afterClipId,
      kind: tr.kind,
      durationMs: Math.round(tr.durationSeconds * MS_PER_S),
    }))

  // Resolve the Cut's single BGM bed to its own audio track (openimago-w5bu).
  // Mirrors clip resolution: a host resolver turns the artifactId → a fetchable
  // url; an unresolvable (or absent) bgm is simply omitted so the lane is skipped
  // rather than fed a url-less effect.
  const bgm = resolveBgmRef(cut, resolveBgm)

  return { clips, transitions, orphans, ...(bgm ? { bgm } : {}) }
}

/**
 * Convert the domain Filmstrip (ms) to the fork's HydrateFilmstrip (seconds).
 * This is the single ms→s seam for the filmstrip's source duration, mirroring the
 * trim-point conversion above: the fork boundary stays seconds (openimago-wa33).
 * Whole-or-null is preserved — a null domain filmstrip stays null.
 */
function toHydrateFilmstrip(filmstrip: Filmstrip | null): HydrateFilmstrip | null {
  if (!filmstrip) return null
  return {
    spriteUrl: filmstrip.spriteUrl,
    frameCount: filmstrip.frameCount,
    frameW: filmstrip.frameW,
    frameH: filmstrip.frameH,
    sourceDurationSeconds: filmstrip.sourceDurationMs / MS_PER_S,
  }
}

function resolveBgmRef(
  cut: EpisodeCut,
  resolveBgm: ((artifactId: string) => BgmMediaSource | null) | undefined,
): HydrateBgm | undefined {
  if (!cut.bgm || !resolveBgm) return undefined
  const source = resolveBgm(cut.bgm.artifactId)
  if (!source) return undefined
  return {
    id: cut.bgm.artifactId,
    url: source.url,
    name: source.name,
    // Forward auth headers (openimago-tc8t) only when the host supplied them, so
    // the omit-when-empty shape stays clean for callers/tests that don't auth.
    ...(source.headers ? { headers: source.headers } : {}),
  }
}
