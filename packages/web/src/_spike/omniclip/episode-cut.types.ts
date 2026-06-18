// THROWAWAY SPIKE — openimago-2re7. Delete with the `_spike/omniclip/` dir.
//
// EpisodeCut shape transcribed verbatim from ADR 0006. Lives here ONLY for the
// spike; the production types will be owned by the StoryService / Issue 2
// endpoints, not by this file.

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

export interface CutTransition {
  afterClipId: string
  kind: string
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
