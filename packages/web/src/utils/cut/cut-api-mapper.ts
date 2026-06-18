// Adapt the api.client OpenimagoEpisodeCut wire type to the panel's EpisodeCut
// (openimago-4eiw). Structurally identical except the wire type widens
// schemaVersion/kind; this narrows + validates so the rest of the cut layer
// works with the strict domain types. Pure, unit-tested.

import type { OpenimagoEpisodeCut } from '../../api/client'
import type { CutClip, CutTransition, EpisodeCut } from './cut-types'
import { isCutTransitionKind } from './cut-types'

export function rawCutToEpisodeCut(raw: OpenimagoEpisodeCut | null): EpisodeCut | null {
  if (!raw) return null

  const clips: CutClip[] = raw.clips.map((c) => ({
    id: c.id,
    sourceShotId: c.sourceShotId,
    inPoint: c.inPoint,
    outPoint: c.outPoint,
    order: c.order,
  }))

  // Drop any transition whose kind isn't one we support (defensive — backend
  // already constrains to CUT_TRANSITION_KINDS).
  const transitions: CutTransition[] = raw.transitions
    .filter((tr) => isCutTransitionKind(tr.kind))
    .map((tr) => ({
      afterClipId: tr.afterClipId,
      kind: tr.kind as CutTransition['kind'],
      durationSeconds: tr.durationSeconds,
    }))

  const cut: EpisodeCut = {
    schemaVersion: 1,
    episodeId: raw.episodeId,
    clips,
    transitions,
    updatedAt: raw.updatedAt,
  }
  if (raw.bgm) {
    cut.bgm = {
      artifactId: raw.bgm.artifactId,
      ...(raw.bgm.gainDb !== undefined ? { gainDb: raw.bgm.gainDb } : {}),
      ...(raw.bgm.inPoint !== undefined ? { inPoint: raw.bgm.inPoint } : {}),
      ...(raw.bgm.outPoint !== undefined ? { outPoint: raw.bgm.outPoint } : {}),
    }
  }
  return cut
}
