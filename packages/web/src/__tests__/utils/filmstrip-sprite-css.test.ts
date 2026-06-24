import { describe, it, expect } from 'vitest'
import {
  spriteBackgroundSizeX,
  effectWidthPx,
  filmstripTileCount,
  FILMSTRIP_TILE_W,
} from 'src/vendor/omniclip-fork/patches/filmstrip-sprite-css'

// The timeline filmstrip lane is CONTINUOUSLY tiled with fixed-width 9:16
// thumbnails of the video's FIRST frame (openimago-jmcp). Each tile is a fixed
// 28×50 box (9:16, matching the 28×50 sprite frame), so the portrait frame shows
// at native ratio — NOT stretched across a wide cell (the openimago-ugli
// regression). The tiles fill the effect's real width (density follows zoom); the
// lane clips the trailing half-tile.

describe('spriteBackgroundSizeX — one frame fills one fixed tile, no distortion', () => {
  it('scales the strip so each of N frames is exactly one tile wide (N*100%)', () => {
    expect(spriteBackgroundSizeX(24)).toBe('2400%')
    expect(spriteBackgroundSizeX(10)).toBe('1000%')
  })

  it('degenerates to the whole image filling the tile when frameCount === 1', () => {
    expect(spriteBackgroundSizeX(1)).toBe('100%')
  })

  it('treats a zero/negative/non-finite frameCount as a single frame (no NaN)', () => {
    expect(spriteBackgroundSizeX(0)).toBe('100%')
    expect(spriteBackgroundSizeX(-5)).toBe('100%')
    expect(spriteBackgroundSizeX(Number.NaN)).toBe('100%')
  })
})

describe('FILMSTRIP_TILE_W — 9:16 tile width for a 50px lane', () => {
  it('is 28 (≈ 50 * 9/16) so the tile matches the sprite frame aspect', () => {
    expect(FILMSTRIP_TILE_W).toBe(28)
  })
})

describe('effectWidthPx — upstream zoom→pixel width (calculate_effect_width)', () => {
  it('returns (end - start) * 2^zoom (ms span scaled by zoom)', () => {
    // 2000ms span at zoom 0 → 2000px (2^0 = 1).
    expect(effectWidthPx(0, 2000, 0)).toBe(2000)
    // zoom -3 → 2^-3 = 0.125 → 250px.
    expect(effectWidthPx(0, 2000, -3)).toBe(250)
    // a trimmed clip [1000,3000] at zoom 1 → 2000 * 2 = 4000px.
    expect(effectWidthPx(1000, 3000, 1)).toBe(4000)
  })

  it('returns 0 for a zero/inverted span or non-finite zoom (no NaN)', () => {
    expect(effectWidthPx(1000, 1000, 0)).toBe(0)
    expect(effectWidthPx(2000, 1000, 0)).toBe(0)
    expect(effectWidthPx(0, 2000, Number.NaN)).toBe(0)
  })
})

describe('filmstripTileCount — fill the width with fixed-width tiles, clamped', () => {
  it('is ceil(widthPx / tileWidth) so tiles seamlessly cover the lane', () => {
    expect(filmstripTileCount(280, 28, 800)).toBe(10) // exact fit
    expect(filmstripTileCount(281, 28, 800)).toBe(11) // overflow tile clipped by lane
    expect(filmstripTileCount(27, 28, 800)).toBe(1) // sub-tile width still shows one
  })

  it('always renders at least one tile for any positive width', () => {
    expect(filmstripTileCount(1, 28, 800)).toBe(1)
  })

  it('clamps to maxTiles for very wide / zoomed-in clips', () => {
    expect(filmstripTileCount(1_000_000, 28, 800)).toBe(800)
  })

  it('returns 0 tiles for a zero/non-finite width (caller renders empty lane)', () => {
    expect(filmstripTileCount(0, 28, 800)).toBe(0)
    expect(filmstripTileCount(Number.NaN, 28, 800)).toBe(0)
  })

  it('treats a zero/invalid tile width as the default 28 (no divide-by-zero)', () => {
    expect(filmstripTileCount(280, 0, 800)).toBe(10)
  })
})
