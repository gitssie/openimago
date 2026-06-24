import { describe, it, expect } from 'vitest'
import { coverScaleRect } from '../cover-scale'

// The preview FabricImage renders the <video> at its INTRINSIC pixel size × scale
// at (left, top) (openimago-kzb3). To fill the portrait canvas we compute a COVER
// scale (the larger of the two axis ratios → no gaps, crop the overflow) and the
// top-left offset that centers the scaled video in the canvas.

describe('coverScaleRect — fill + center the video in the canvas', () => {
  it('same aspect (9:16 video into 9:16 canvas) fills exactly, no offset', () => {
    // 720×1280 video → 1080×1920 canvas: both ratios = 1.5.
    const r = coverScaleRect(1080, 1920, 720, 1280)
    expect(r.scaleX).toBe(1.5)
    expect(r.scaleY).toBe(1.5)
    expect(r.left).toBe(0)
    expect(r.top).toBe(0)
  })

  it('already canvas-sized video → scale 1, no offset', () => {
    const r = coverScaleRect(1080, 1920, 1080, 1920)
    expect(r.scaleX).toBe(1)
    expect(r.scaleY).toBe(1)
    expect(r.left).toBe(0)
    expect(r.top).toBe(0)
  })

  it('landscape video into portrait canvas covers by HEIGHT, crops width, centers horizontally', () => {
    // 1920×1080 into 1080×1920: ratios = 1080/1920=0.5625, 1920/1080=1.777… → max = 1.777…
    const r = coverScaleRect(1080, 1920, 1920, 1080)
    const scale = 1920 / 1080
    expect(r.scaleX).toBe(scale)
    expect(r.scaleY).toBe(scale)
    // scaled width = 1920*scale = 3413.33 > 1080 → negative left centers (crops sides).
    expect(r.left).toBeCloseTo((1080 - 1920 * scale) / 2, 5)
    expect(r.top).toBeCloseTo((1920 - 1080 * scale) / 2, 5) // = 0
    expect(r.top).toBeCloseTo(0, 5)
  })

  it('portrait video narrower than canvas covers by WIDTH, crops height, centers vertically', () => {
    // 540×1920 into 1080×1920: ratios = 1080/540=2, 1920/1920=1 → max = 2.
    const r = coverScaleRect(1080, 1920, 540, 1920)
    expect(r.scaleX).toBe(2)
    expect(r.left).toBeCloseTo(0, 5) // 1080 - 540*2 = 0
    expect(r.top).toBeCloseTo((1920 - 1920 * 2) / 2, 5) // negative → crops top/bottom
  })

  it('returns scale 1 / no offset for non-finite or non-positive dimensions (no NaN)', () => {
    expect(coverScaleRect(1080, 1920, 0, 1280)).toEqual({ scaleX: 1, scaleY: 1, left: 0, top: 0 })
    expect(coverScaleRect(1080, 1920, 720, 0)).toEqual({ scaleX: 1, scaleY: 1, left: 0, top: 0 })
    expect(coverScaleRect(0, 1920, 720, 1280)).toEqual({ scaleX: 1, scaleY: 1, left: 0, top: 0 })
    expect(coverScaleRect(1080, 1920, Number.NaN, 1280)).toEqual({ scaleX: 1, scaleY: 1, left: 0, top: 0 })
  })
})
