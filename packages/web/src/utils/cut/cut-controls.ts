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

/** How to drive omniclip's reactive zoom from a slider target. */
export interface ZoomStepPlan {
  /** which action to call repeatedly: zoom_in, zoom_out, or neither. */
  direction: 'in' | 'out' | 'none'
  /** how many ±step action calls to reach (the nearest whole step to) target. */
  count: number
}

/**
 * Translate a desired absolute zoom (`target`) into a number of discrete
 * ±`step` action calls from the `current` zoom. omniclip exposes only
 * `zoom_in`/`zoom_out` (each mutates `state.zoom` by ±step through the reactive
 * actions proxy) and NO `set_zoom`, so a slider must reach its target by calling
 * the existing reactive actions the right number of times — that is the ONLY
 * route that triggers the same reactivity (ruler ticks + clip widths recompute).
 *
 * The delta is rounded to the NEAREST whole step so float drift in `current`
 * (e.g. -2.9999999 from accumulated ±0.1) and sub-step slider noise never produce
 * fractional/endless calls. Pure + unit-tested so the browser-only toolbar view
 * stays a thin caller.
 */
export function zoomSteps(current: number, target: number, step: number): ZoomStepPlan {
  const raw = (target - current) / step
  const count = Math.round(raw)
  if (count === 0) return { direction: 'none', count: 0 }
  return { direction: count > 0 ? 'in' : 'out', count: Math.abs(count) }
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
