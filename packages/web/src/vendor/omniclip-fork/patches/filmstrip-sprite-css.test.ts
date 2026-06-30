import { describe, it, expect } from 'vitest'

import { filmstripVisibleSlice } from './filmstrip-sprite-css'

// openimago-fg8y: the filmstrip is virtualized to the visible viewport slice of each
// clip so a 8100px (64s) clip paints only the ~viewport-wide visible portion, not its
// full width. filmstripVisibleSlice is the PURE intersection helper (no DOM) — these
// tests pin its rect math. Coordinates: clipLeftPx/clipWidthPx are the clip's rect in
// timeline pixels; scrollLeftPx/viewportWidthPx are the visible viewport; the returned
// offsetPx/widthPx are CLIP-LOCAL (offset from the clip's own left edge).
describe('filmstripVisibleSlice', () => {
  it('paints the whole clip when it fits entirely inside the viewport', () => {
    // clip [100,300] inside viewport [0,1000]
    const s = filmstripVisibleSlice(100, 200, 0, 1000, 0)
    expect(s).toEqual({ visible: true, offsetPx: 0, widthPx: 200 })
  })

  it('paints nothing when the clip is fully left of the viewport', () => {
    // clip [0,200] entirely left of viewport [500,1500]
    const s = filmstripVisibleSlice(0, 200, 500, 1000, 0)
    expect(s.visible).toBe(false)
    expect(s.widthPx).toBe(0)
  })

  it('paints nothing when the clip is fully right of the viewport', () => {
    // clip [2000,2200] entirely right of viewport [0,1000]
    const s = filmstripVisibleSlice(2000, 200, 0, 1000, 0)
    expect(s.visible).toBe(false)
    expect(s.widthPx).toBe(0)
  })

  it('clamps a clip much wider than the viewport to the viewport slice (the s07 case)', () => {
    // s07-race-prep: ~8100px clip, viewport ~1500px scrolled into its middle.
    const clipLeft = 4000
    const clipWidth = 8100
    const scrollLeft = 6000 // viewport [6000,7500] sits inside the clip
    const viewportW = 1500
    const s = filmstripVisibleSlice(clipLeft, clipWidth, scrollLeft, viewportW, 0)
    expect(s.visible).toBe(true)
    // local offset = scrollLeft - clipLeft = 2000; width = viewport width = 1500
    expect(s.offsetPx).toBe(2000)
    expect(s.widthPx).toBe(1500)
    // painted width is bounded by the viewport, NOT the 8100px clip
    expect(s.widthPx).toBeLessThan(clipWidth)
  })

  it('clips to the left viewport edge when the clip starts before it', () => {
    // clip [0,3000], viewport [1000,2000] → local slice [1000,2000]
    const s = filmstripVisibleSlice(0, 3000, 1000, 1000, 0)
    expect(s).toEqual({ visible: true, offsetPx: 1000, widthPx: 1000 })
  })

  it('clips to the right edge of the clip when it ends inside the viewport', () => {
    // clip [800,1000] (ends at 1800), viewport [1000,3000] → local slice [200,1000]
    const s = filmstripVisibleSlice(800, 1000, 1000, 2000, 0)
    expect(s.visible).toBe(true)
    expect(s.offsetPx).toBe(200) // scrollLeft - clipLeft
    expect(s.widthPx).toBe(800) // clip end (1800) - viewport start (1000)
    // never paints past the clip's own width
    expect(s.offsetPx + s.widthPx).toBeLessThanOrEqual(1000)
  })

  it('extends the slice by the overscan margin on both sides (still clamped to the clip)', () => {
    // clip [0,3000], viewport [1000,2000], overscan 300 → local slice [700,2300]
    const s = filmstripVisibleSlice(0, 3000, 1000, 1000, 300)
    expect(s.offsetPx).toBe(700)
    expect(s.widthPx).toBe(1600)
  })

  it('overscan never pushes the slice outside the clip bounds', () => {
    // clip [0,200] fully visible, huge overscan must clamp to [0,200]
    const s = filmstripVisibleSlice(0, 200, 0, 1000, 5000)
    expect(s.offsetPx).toBe(0)
    expect(s.widthPx).toBe(200)
  })

  it('returns not-visible for a zero or inverted clip width', () => {
    expect(filmstripVisibleSlice(100, 0, 0, 1000, 0).visible).toBe(false)
    expect(filmstripVisibleSlice(100, -50, 0, 1000, 0).visible).toBe(false)
  })

  it('falls back to the full clip when the viewport is unknown (clientWidth 0 / non-finite)', () => {
    // Before the scroll container is measured, clientWidth can be 0 — must NOT blank the
    // strip; degrade to the un-virtualized full-width strip.
    expect(filmstripVisibleSlice(100, 500, 0, 0, 0)).toEqual({ visible: true, offsetPx: 0, widthPx: 500 })
    expect(filmstripVisibleSlice(100, 500, 0, Number.NaN, 0)).toEqual({ visible: true, offsetPx: 0, widthPx: 500 })
  })

  it('falls back to the full clip when scrollLeft is non-finite', () => {
    expect(filmstripVisibleSlice(100, 500, Number.NaN, 1000, 0)).toEqual({ visible: true, offsetPx: 0, widthPx: 500 })
  })
})
