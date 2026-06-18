// Cut edit dispatcher (openimago-4eiw).
//
// Maps an editor edit event to the right gf8f write endpoint, each wrapped in
// the cut's optimistic-concurrency retry (runCutMutation). The omniclip panel
// emits these events; this is the single place edit-kind -> endpoint lives, so
// it is unit-tested with a fake api (no Vue, no network).

import { runCutMutation, type CutMutationOutcome } from './cut-mutation'
import type { CutTransitionKind } from './cut-types'

/** Editor edits, in our domain language (not omniclip's). */
export type CutEdit =
  | { kind: 'reorder'; orderedClipIds: string[] }
  | { kind: 'trim'; clipId: string; inPoint: number; outPoint: number }
  | { kind: 'split'; clipId: string; atSeconds: number }
  | { kind: 'delete'; clipId: string }
  | { kind: 'set-transition'; afterClipId: string; transitionKind: CutTransitionKind; durationSeconds: number }
  | { kind: 'clear-transition'; afterClipId: string }
  | { kind: 'set-bgm'; artifactId: string; gainDb?: number; inPoint?: number; outPoint?: number }
  | { kind: 'clear-bgm' }

/** The subset of the api.client cut methods this dispatcher needs. */
export interface CutWriteApi {
  reorderCutClips: (projectId: string, episodeId: string, orderedClipIds: string[], expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  trimCutClip: (projectId: string, episodeId: string, clipId: string, inPoint: number, outPoint: number, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  splitCutClip: (projectId: string, episodeId: string, clipId: string, atSeconds: number, expectedUpdatedAt?: string) => Promise<{ updatedAt: string; newClipId: string }>
  deleteCutClip: (projectId: string, episodeId: string, clipId: string, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  setCutTransition: (projectId: string, episodeId: string, afterClipId: string, kind: string, durationSeconds: number, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  clearCutTransition: (projectId: string, episodeId: string, afterClipId: string, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  setCutBgm: (projectId: string, episodeId: string, bgm: { artifactId: string; gainDb?: number; inPoint?: number; outPoint?: number }, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
  clearCutBgm: (projectId: string, episodeId: string, expectedUpdatedAt?: string) => Promise<{ updatedAt: string }>
}

export interface DispatchCutEditDeps {
  api: CutWriteApi
  projectId: string
  episodeId: string
  /** current cut updatedAt for optimistic concurrency. */
  currentUpdatedAt: () => string | undefined
  /** refetch the cut, returning the fresh updatedAt. */
  refetch: () => Promise<string | undefined>
}

/** Build the single-write function for an edit (bound to expectedUpdatedAt). */
function writeFor(deps: DispatchCutEditDeps, edit: CutEdit) {
  const { api, projectId: p, episodeId: e } = deps
  switch (edit.kind) {
    case 'reorder':
      return (u?: string) => api.reorderCutClips(p, e, edit.orderedClipIds, u)
    case 'trim':
      return (u?: string) => api.trimCutClip(p, e, edit.clipId, edit.inPoint, edit.outPoint, u)
    case 'split':
      return (u?: string) => api.splitCutClip(p, e, edit.clipId, edit.atSeconds, u)
    case 'delete':
      return (u?: string) => api.deleteCutClip(p, e, edit.clipId, u)
    case 'set-transition':
      return (u?: string) => api.setCutTransition(p, e, edit.afterClipId, edit.transitionKind, edit.durationSeconds, u)
    case 'clear-transition':
      return (u?: string) => api.clearCutTransition(p, e, edit.afterClipId, u)
    case 'set-bgm':
      return (u?: string) =>
        api.setCutBgm(
          p,
          e,
          {
            artifactId: edit.artifactId,
            ...(edit.gainDb !== undefined ? { gainDb: edit.gainDb } : {}),
            ...(edit.inPoint !== undefined ? { inPoint: edit.inPoint } : {}),
            ...(edit.outPoint !== undefined ? { outPoint: edit.outPoint } : {}),
          },
          u,
        )
    case 'clear-bgm':
      return (u?: string) => api.clearCutBgm(p, e, u)
  }
}

/** Persist one edit with the cut's 409 refetch-retry. */
export function dispatchCutEdit(deps: DispatchCutEditDeps, edit: CutEdit): Promise<CutMutationOutcome> {
  const mutate = writeFor(deps, edit)
  return runCutMutation({
    currentUpdatedAt: deps.currentUpdatedAt,
    refetch: deps.refetch,
    mutate,
  })
}
