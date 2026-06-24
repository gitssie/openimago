import { describe, it, expect } from 'vitest'
import {
  spriteBackgroundSizeX,
  filmstripCellCount,
  FILMSTRIP_TILE_W,
} from 'src/vendor/omniclip-fork/patches/filmstrip-sprite-css'

// The timeline filmstrip lane shows EXACTLY ONE 9:16 first-frame thumbnail per
// second of the clip (openimago-7vrd). Each 1-second cell holds a fixed 28×50
// thumbnail box left-aligned at the second's start; the frame shows at native
// aspect (NOT stretched to fill the wide cell — the openimago-ugli/u3qq
// regression). Gaps between thumbnails (lane background) are intentional.

describe('spriteBackgroundSizeX — one frame fills the fixed 28px box, no distortion', () => {
  it('scales the strip so each of N frames is exactly one box wide (N*100%)', () => {
    expect(spriteBackgroundSizeX(24)).toBe('2400%')
    expect(spriteBackgroundSizeX(10)).toBe('1000%')
  })

  it('degenerates to the whole image filling the box when frameCount === 1', () => {
    expect(spriteBackgroundSizeX(1)).toBe('100%')
  })

  it('treats a zero/negative/non-finite frameCount as a single frame (no NaN)', () => {
    expect(spriteBackgroundSizeX(0)).toBe('100%')
    expect(spriteBackgroundSizeX(-5)).toBe('100%')
    expect(spriteBackgroundSizeX(Number.NaN)).toBe('100%')
  })
})

describe('FILMSTRIP_TILE_W — 9:16 thumbnail box width for a 50px lane', () => {
  it('is 28 (≈ 50 * 9/16) so the box matches the sprite frame aspect', () => {
    expect(FILMSTRIP_TILE_W).toBe(28)
  })
})

describe('filmstripCellCount — exactly one thumbnail per second', () => {
  it('is ceil(durationSeconds) — one cell per second of the clip', () => {
    expect(filmstripCellCount(15, 800)).toBe(15) // s02 → 15 thumbnails
    expect(filmstripCellCount(64.76, 800)).toBe(65) // s07 → 65 thumbnails
    expect(filmstripCellCount(10.05, 800)).toBe(11)
  })

  it('renders at least one thumbnail for a sub-second clip', () => {
    expect(filmstripCellCount(0.4, 800)).toBe(1)
    expect(filmstripCellCount(1, 800)).toBe(1)
  })

  it('clamps to maxCells for very long clips', () => {
    expect(filmstripCellCount(10_000, 800)).toBe(800)
  })

  it('returns 0 for a zero/non-finite duration (caller renders empty lane)', () => {
    expect(filmstripCellCount(0, 800)).toBe(0)
    expect(filmstripCellCount(-3, 800)).toBe(0)
    expect(filmstripCellCount(Number.NaN, 800)).toBe(0)
  })
})
