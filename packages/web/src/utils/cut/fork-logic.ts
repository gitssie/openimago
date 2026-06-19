// Pure, headless-testable logic extracted from the omniclip fork (openimago-uyd0).
//
// These functions contain NO omniclip / DOM-runtime dependency, so they are
// unit-tested in this repo even though the fork as a whole only runs in a
// browser. The vendored fork (src/vendor/omniclip-fork/) imports these so the
// browser code and the tested logic cannot drift.

import type { CutTransitionKind } from './cut-types'
import { CUT_TRANSITION_KINDS } from './cut-types'

/** Shape stored in the patched omniclip historical state (one per boundary). */
export interface ForkTransition {
  afterEffectId: string
  kind: CutTransitionKind
  durationMs: number
}

// ─── URL import: derive a File name + validate the fetched type ────────────────

/** Derive a sensible file name from a media URL (used by importFromUrl). */
export function fileNameFromUrl(url: string, override?: string): string {
  if (override && override.trim()) return override.trim()
  try {
    const u = new URL(url, 'https://placeholder.local')
    const base = u.pathname.split('/').filter(Boolean).pop()
    if (base) return decodeURIComponent(base)
  } catch {
    // fall through to default
  }
  return 'clip'
}

/**
 * omniclip's import_file branches on MIME prefix (video/image/audio). A remote
 * Run media URL may arrive with a generic or missing content-type; this picks
 * the omniclip "kind" from content-type first, then the file extension.
 * Returns null when nothing usable can be determined (caller should reject).
 */
export function omniMediaKindFromType(
  contentType: string | null | undefined,
  fileName: string,
): 'video' | 'image' | 'audio' | null {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.startsWith('video/')) return 'video'
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('audio/')) return 'audio'

  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : ''
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio'
  return null
}

// ─── Transition primitive: clamp + validate ───────────────────────────────────

export function isCutTransitionKind(value: string): value is CutTransitionKind {
  return (CUT_TRANSITION_KINDS as readonly string[]).includes(value)
}

/**
 * Clamp a transition duration so it never exceeds either adjacent clip's length
 * (a transition longer than its neighbours would over-run the timeline). Pure;
 * the fork calls this before committing a transition to state.
 *
 * `kind: 'cut'` is an instantaneous boundary — its duration is always 0.
 */
export function clampTransitionDurationMs(
  kind: CutTransitionKind,
  requestedMs: number,
  beforeClipDurationMs: number,
  afterClipDurationMs: number,
): number {
  if (kind === 'cut') return 0
  const safeRequested = Number.isFinite(requestedMs) && requestedMs > 0 ? requestedMs : 0
  const maxByNeighbours = Math.max(0, Math.min(beforeClipDurationMs, afterClipDurationMs))
  return Math.min(safeRequested, maxByNeighbours)
}

// ─── Transition state reducers (one transition per clip boundary) ──────────────
// Pure array transforms the patched omniclip actions delegate to, so the
// reducer behaviour is tested headless and the AppCore action just calls these.

/** Upsert a transition after a clip — replaces any existing one on that boundary. */
export function upsertTransition(
  transitions: ForkTransition[],
  next: ForkTransition,
): ForkTransition[] {
  const filtered = transitions.filter((t) => t.afterEffectId !== next.afterEffectId)
  return [...filtered, next]
}

/** Remove the transition after a given clip (no-op if none). */
export function removeTransition(
  transitions: ForkTransition[],
  afterEffectId: string,
): ForkTransition[] {
  return transitions.filter((t) => t.afterEffectId !== afterEffectId)
}
