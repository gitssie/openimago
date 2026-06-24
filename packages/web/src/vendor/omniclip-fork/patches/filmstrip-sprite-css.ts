// Pure CSS-math for the timeline filmstrip sprite cells (openimago-ugli).
//
// The filmstrip is ONE horizontal strip of `frameCount` frames. Each visible
// `.sprite-cell` is a flex box (`flex: 1 1 0`) whose pixel width is usually far
// wider than the 28px sprite frame. The earlier pixel-based
// `background-size: <stripPxW>px` fit the WHOLE strip into the wide cell, so the
// cell revealed several consecutive frames instead of one.
//
// The strip is only a "which video is this" marker — every cell shows the FIRST
// frame (frame 0, background-position-x = 0); there is no time→frame mapping.
// Expressing the crop as a PERCENTAGE of the cell makes that one frame fill the
// whole cell regardless of its pixel width:
//   - background-size-x = frameCount * 100%  → each frame == one cell width.
//   - background-position-x = 0              → always the first frame.
//
// NO imports — kept dependency-free so it is unit-testable in vitest without
// booting the omniclip view (whose @benev/slate / omniclip/x imports do not
// resolve under the test runner). BROWSER-ONLY dir, excluded from typecheck.

/**
 * `background-size` X value: scale the N-frame strip so each frame is exactly
 * one cell wide. `${frameCount * 100}%`. A missing/invalid or single-frame
 * sprite degenerates to 100% (the whole image fills the cell — no NaN).
 */
export function spriteBackgroundSizeX(frameCount: number): string {
  const n = Number.isFinite(frameCount) && frameCount >= 1 ? frameCount : 1
  return `${n * 100}%`
}
