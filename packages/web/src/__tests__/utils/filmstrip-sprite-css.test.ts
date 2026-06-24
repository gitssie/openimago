import { describe, it, expect } from 'vitest'
import { spriteBackgroundSizeX } from 'src/vendor/omniclip-fork/patches/filmstrip-sprite-css'

// The timeline filmstrip renders one `.sprite-cell` per second; each cell is a
// flex box whose pixel width is usually ≫ the 28px sprite frame. Pixel-based
// background-size only fit the WHOLE strip into a wide cell, so several frames
// leaked into one cell (openimago-ugli). The cell shows the video's FIRST frame
// purely as a "which video is this" marker — no time→frame mapping. This helper
// scales the strip so exactly ONE frame (frame 0, positioned at 0) fills each
// cell regardless of its pixel width.

describe('spriteBackgroundSizeX — one frame == one cell width', () => {
  it('scales the strip so each of N frames is exactly one cell wide (N*100%)', () => {
    expect(spriteBackgroundSizeX(24)).toBe('2400%')
    expect(spriteBackgroundSizeX(10)).toBe('1000%')
  })

  it('degenerates to the whole image filling the cell when frameCount === 1', () => {
    expect(spriteBackgroundSizeX(1)).toBe('100%')
  })

  it('treats a zero/negative/non-finite frameCount as a single frame (no NaN)', () => {
    expect(spriteBackgroundSizeX(0)).toBe('100%')
    expect(spriteBackgroundSizeX(-5)).toBe('100%')
    expect(spriteBackgroundSizeX(Number.NaN)).toBe('100%')
  })
})
