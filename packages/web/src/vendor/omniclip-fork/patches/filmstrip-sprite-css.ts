// Pure CSS-math for the timeline filmstrip tiles (openimago-jmcp).
//
// The filmstrip lane is CONTINUOUSLY tiled with fixed-width 9:16 thumbnails of
// the video's FIRST frame — a "which video is this" marker, no time→frame
// mapping. The tiles fill the effect's real rendered width (density follows the
// timeline zoom); the lane clips the trailing half-tile. The sprite is ONE
// horizontal strip of `frameCount` frames; each tile crops to frame 0 by
// PERCENTAGE so that single frame fills the FIXED tile at native 9:16 aspect:
//   - background-size-x = frameCount * 100%  → each frame == one tile width.
//   - background-position-x = 0              → always the first frame.
//
// The tile is a FIXED 28×50 (9:16) box, NOT a wide flex cell. Fixing the width
// keeps the portrait frame at native aspect; stretching one frame to fill a wide
// cell distorted it into a horizontal bar (openimago-ugli).
//
// NO imports — kept dependency-free so it is unit-testable in vitest without
// booting the omniclip view (whose @benev/slate / omniclip/x imports do not
// resolve under the test runner). BROWSER-ONLY dir, excluded from typecheck.

/**
 * `background-size` X value: scale the N-frame strip so each frame is exactly
 * one TILE wide. `${frameCount * 100}%`. A missing/invalid or single-frame
 * sprite degenerates to 100% (the whole image fills the tile — no NaN).
 */
export function spriteBackgroundSizeX(frameCount: number): string {
  const n = Number.isFinite(frameCount) && frameCount >= 1 ? frameCount : 1
  return `${n * 100}%`
}

/**
 * Fixed filmstrip tile width in px: a 9:16 portrait box for the 50px omniclip
 * lane (50 * 9/16 = 28.125 → 28, matching the sprite frame width). Fixing the
 * tile width keeps the FIRST-frame thumbnail at native aspect — stretching it to
 * fill a wider cell distorted it into a horizontal bar (openimago-ugli).
 */
export const FILMSTRIP_TILE_W = 28

/**
 * Effect's real rendered pixel width = the upstream omniclip formula
 * `calculate_effect_width`: `(end - start) * 2^zoom` (start/end in ms, zoom is
 * `context.state.zoom`). Read state directly — never subscribe the editor from
 * inside the fork. Returns 0 for a zero/inverted span or non-finite zoom so the
 * caller renders an empty lane instead of NaN tiles.
 */
export function effectWidthPx(startMs: number, endMs: number, zoom: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(zoom)) return 0
  const span = endMs - startMs
  if (span <= 0) return 0
  return span * Math.pow(2, zoom)
}

/**
 * Number of fixed-width tiles to seamlessly cover `widthPx`: `ceil(widthPx /
 * tileWidth)` (the lane clips the trailing overflow tile). Always ≥1 for a
 * positive width; clamped to `maxTiles` for very wide / zoomed-in clips; 0 for a
 * zero/non-finite width (caller renders an empty lane). A zero/invalid tile
 * width falls back to the default (no divide-by-zero).
 */
export function filmstripTileCount(widthPx: number, tileWidth: number, maxTiles: number): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 0
  const w = Number.isFinite(tileWidth) && tileWidth > 0 ? tileWidth : FILMSTRIP_TILE_W
  return Math.max(1, Math.min(maxTiles, Math.ceil(widthPx / w)))
}
