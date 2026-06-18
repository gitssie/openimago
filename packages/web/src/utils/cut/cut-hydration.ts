// Build the fork hydration payload from a canonical EpisodeCut (openimago-addv).
//
// Pure: maps cut.json clips (ordered) + a media resolver → the HydrateClip[]
// the fork's hydrateFromCut consumes, plus the transitions converted to omniclip
// ms and keyed by the clip id they follow. Orphan clips (no resolvable media)
// are split out so the host can surface them via the data-no-file path rather
// than feeding a urless clip to the importer. Unit-tested headless.

import type { CutClip, EpisodeCut } from './cut-types'
import type { HydrateClip, OmniTransition } from './fork-contract'
import type { ShotMediaSource } from './shot-media-resolver'

const MS_PER_S = 1000

export interface HydrationPayload {
  /** clips with resolvable media, in cut order — fed to the fork. */
  clips: HydrateClip[]
  /** transitions (omniclip ms) keyed by the clip they follow. */
  transitions: OmniTransition[]
  /** clips whose source media is gone — rendered as orphan placeholders. */
  orphans: CutClip[]
}

export function buildHydrationPayload(
  cut: EpisodeCut,
  resolveMedia: (sourceShotId: string) => ShotMediaSource | null,
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
    clips.push({
      id: clip.id,
      url: media.url,
      name: media.name,
      inPointSeconds: clip.inPoint,
      outPointSeconds: clip.outPoint,
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

  return { clips, transitions, orphans }
}
