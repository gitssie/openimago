// Production EpisodeCut + media-resolution types (ADR 0006/0007, openimago-4eiw).
// Promoted from the spike (openimago-2re7). Field names match the SHIPPED
// backend (packages/openimago/src/project/story-service.ts) and the api.client
// `Openimago*` mirrors — verified no drift (openimago-c80q).

/** Allowed transition kinds — mirrors backend CUT_TRANSITION_KINDS. */
export const CUT_TRANSITION_KINDS = ['cut', 'dissolve', 'fade'] as const
export type CutTransitionKind = (typeof CUT_TRANSITION_KINDS)[number]

export interface CutClip {
  id: string
  sourceShotId: string
  inPoint: number // seconds
  outPoint: number // seconds
  order: number // 0-based position on the video track
}

export interface CutTransition {
  afterClipId: string
  kind: CutTransitionKind
  durationSeconds: number
}

export interface CutAudioRef {
  artifactId: string
  gainDb?: number
  inPoint?: number
  outPoint?: number
}

export interface EpisodeCut {
  schemaVersion: 1
  episodeId: string
  clips: CutClip[]
  transitions: CutTransition[]
  bgm?: CutAudioRef
  updatedAt: string
}

/**
 * Per-source media facts the mapper needs to hydrate a clip into an omniclip
 * VideoEffect. `fileHash`/`frames`/`rawDurationSeconds`/`thumbnail` are
 * import-derived (browser) — the panel obtains them via the fork's
 * importFromUrl; `url` comes from the source Shot's completed Run.
 */
export interface ResolvedShotMedia {
  sourceShotId: string
  url: string
  fileHash: string
  rawDurationSeconds: number
  frames: number
  thumbnail: string
  name: string
}

export function isCutTransitionKind(value: string): value is CutTransitionKind {
  return (CUT_TRANSITION_KINDS as readonly string[]).includes(value)
}
