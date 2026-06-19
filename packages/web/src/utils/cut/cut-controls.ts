// Pure view-state helpers for the host-driven transition & BGM controls
// (ADR 0008 #1b, openimago-ofdw).
//
// Transitions and BGM are host-driven (omniclip 1.0.7 has no native UI for
// them), so the StoryCutPanel renders its own controls that emit CutEdits. The
// data-shaping those controls need — which clip boundaries can hold a transition
// and what the current BGM is called — is pure and unit-tested here, keeping the
// Vue component thin.

import type { CutClip, CutTransition, CutAudioRef } from './cut-types'

/** A boundary between two consecutive clips where a transition may sit. */
export interface TransitionBoundary {
  /** the clip the transition plays AFTER (mirrors CutTransition.afterClipId). */
  afterClipId: string
  /** the clip the transition plays INTO. */
  beforeClipId: string
  /** 1-based index of the boundary (for "片段 1 → 2" style labels). */
  position: number
  /** the transition currently on this boundary, or null when none. */
  transition: CutTransition | null
}

/**
 * Derive the ordered list of clip boundaries (N clips → N-1 boundaries), each
 * annotated with the transition currently on it. Clips are taken in `order`;
 * boundaries are keyed by the preceding clip's id (afterClipId), matching the
 * backend's per-boundary transition model.
 */
export function transitionBoundaries(
  clips: readonly CutClip[],
  transitions: readonly CutTransition[],
): TransitionBoundary[] {
  const ordered = [...clips].sort((a, b) => a.order - b.order)
  const byAfter = new Map<string, CutTransition>()
  for (const t of transitions) byAfter.set(t.afterClipId, t)

  const boundaries: TransitionBoundary[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const before = ordered[i]!
    const after = ordered[i + 1]!
    boundaries.push({
      afterClipId: before.id,
      beforeClipId: after.id,
      position: i + 1,
      transition: byAfter.get(before.id) ?? null,
    })
  }
  return boundaries
}

/** A minimal audio asset shape the BGM picker resolves names against. */
export interface BgmAsset {
  id: string
  name?: string
  filename?: string
}

/**
 * Human label for the Cut's current BGM: the asset's name/filename when the
 * artifact is found, the bare artifactId as a fallback, or null when no BGM is
 * set. Pure so the panel's display stays testable.
 */
export function resolveBgmLabel(
  bgm: CutAudioRef | undefined,
  assets: readonly BgmAsset[],
): string | null {
  if (!bgm) return null
  const match = assets.find((a) => a.id === bgm.artifactId)
  return match?.name || match?.filename || bgm.artifactId
}
