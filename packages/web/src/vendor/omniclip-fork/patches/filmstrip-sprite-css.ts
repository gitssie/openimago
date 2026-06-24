// Pure CSS-math for the timeline filmstrip thumbnails (openimago-7vrd).
//
// The filmstrip lane shows EXACTLY ONE 9:16 thumbnail of the video's FIRST frame
// per second of the clip — a "which video is this" marker, no time→frame
// mapping. Each 1-second cell holds a FIXED 28×50 thumbnail box left-aligned at
// the second's start; the rest of the (wider) cell shows the lane background, so
// gaps between thumbnails are intentional. The sprite is ONE horizontal strip of
// `frameCount` frames; each box crops to frame 0 by PERCENTAGE so that single
// frame fills the FIXED box at native 9:16 aspect:
//   - background-size-x = frameCount * 100%  → each frame == one box width.
//   - background-position-x = 0              → always the first frame.
//
// The box is FIXED 28×50 — NOT stretched to fill the wide 1-second cell, which
// distorted the portrait frame into a horizontal bar (openimago-ugli/u3qq).
//
// NO imports — kept dependency-free so it is unit-testable in vitest without
// booting the omniclip view (whose @benev/slate / omniclip/x imports do not
// resolve under the test runner). BROWSER-ONLY dir, excluded from typecheck.

/**
 * `background-size` X value: scale the N-frame strip so each frame is exactly
 * one BOX wide. `${frameCount * 100}%`. A missing/invalid or single-frame
 * sprite degenerates to 100% (the whole image fills the box — no NaN).
 */
export function spriteBackgroundSizeX(frameCount: number): string {
  const n = Number.isFinite(frameCount) && frameCount >= 1 ? frameCount : 1
  return `${n * 100}%`
}

/**
 * Fixed thumbnail box width in px: a 9:16 portrait box for the 50px omniclip
 * lane (50 * 9/16 = 28.125 → 28, matching the sprite frame width). Fixing the
 * box width keeps the FIRST-frame thumbnail at native aspect — stretching it to
 * fill the wider 1-second cell distorted it into a horizontal bar
 * (openimago-ugli/u3qq).
 */
export const FILMSTRIP_TILE_W = 28

/**
 * Number of thumbnails for a clip: `ceil(durationSeconds)` — exactly ONE per
 * second. Always ≥1 for any positive (incl. sub-second) duration; clamped to
 * `maxCells` for very long clips; 0 for a zero/non-finite duration (caller
 * renders an empty lane).
 */
export function filmstripCellCount(durationSeconds: number, maxCells: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  return Math.max(1, Math.min(maxCells, Math.ceil(durationSeconds)))
}
