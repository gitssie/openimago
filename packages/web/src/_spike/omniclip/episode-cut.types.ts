// SPIKE-origin types — openimago-2re7. Promoted out of `_spike/` during
// integration (openimago-4eiw). Field names match the SHIPPED backend
// (packages/openimago/src/project/story-service.ts EpisodeCut/CutClip/
// CutTransition/CutAudioRef) and the api.client `Openimago*` mirrors — verified
// no drift (openimago-c80q).

export interface EpisodeCut {
  schemaVersion: 1
  episodeId: string
  clips: CutClip[]
  transitions: CutTransition[]
  bgm?: CutAudioRef
  updatedAt: string
}

export interface CutClip {
  id: string
  sourceShotId: string
  inPoint: number // seconds
  outPoint: number // seconds
  order: number // 0-based position on the video track
}

/**
 * Allowed transition kinds — mirrors the shipped backend `CUT_TRANSITION_KINDS`
 * (packages/openimago/src/project/story-service.ts). Keep in sync. The omniclip
 * fork (openimago-uyd0) adds a transition primitive that round-trips exactly
 * these kinds. (openimago-c80q)
 */
export const CUT_TRANSITION_KINDS = ['cut', 'dissolve', 'fade'] as const
export type CutTransitionKind = (typeof CUT_TRANSITION_KINDS)[number]

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

/**
 * Resolves a Shot's media for hydration. In production this comes from the
 * Shot's completed Run artifact. The spike's whole point is that a URL is NOT
 * enough for omniclip (see mapper notes) — we also need the per-source facts
 * omniclip derives at import (hash, frame count, raw duration, thumbnail).
 */
export interface ResolvedShotMedia {
  sourceShotId: string
  /** remote URL of the generated media (from the completed Run). */
  url: string
  /**
   * omniclip keys media by content hash, NOT url. Only known AFTER the Blob
   * has been fetched + imported through omniclip's media controller.
   */
  fileHash: string
  /** full source media duration, seconds (ffprobe/WebCodecs, client-side). */
  rawDurationSeconds: number
  /** frame count of source media (ffprobe), needed for VideoEffect. */
  frames: number
  /** data-URL / objectURL thumbnail omniclip generates on import. */
  thumbnail: string
  name: string
}
