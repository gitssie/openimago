import { describe, it, expect } from 'vitest'
import { clampClipRange } from '../clamp-clip-range'

describe('clampClipRange (openimago-lknv)', () => {
  it('leaves an in-range clip untouched and reports clamped=false', () => {
    expect(clampClipRange(1000, 4000, 10000)).toEqual({
      inPointMs: 1000,
      outPointMs: 4000,
      clamped: false,
    })
  })

  it('clamps an out point past the source duration down to it', () => {
    expect(clampClipRange(1000, 15000, 10000)).toEqual({
      inPointMs: 1000,
      outPointMs: 10000,
      clamped: true,
    })
  })

  it('clamps a negative in point up to 0', () => {
    expect(clampClipRange(-500, 4000, 10000)).toEqual({
      inPointMs: 0,
      outPointMs: 4000,
      clamped: true,
    })
  })

  it('clamps both bounds when both are out of range', () => {
    expect(clampClipRange(-200, 99999, 8000)).toEqual({
      inPointMs: 0,
      outPointMs: 8000,
      clamped: true,
    })
  })

  it('skips the upper-bound clamp when sourceDurationMs is missing (null)', () => {
    // Legacy v1 data has no snapshot — keep the range as-is on the upper side,
    // still flooring the in point at 0.
    expect(clampClipRange(2000, 99999, null)).toEqual({
      inPointMs: 2000,
      outPointMs: 99999,
      clamped: false,
    })
    expect(clampClipRange(-1, 99999, null)).toEqual({
      inPointMs: 0,
      outPointMs: 99999,
      clamped: true,
    })
  })

  it('skips the upper-bound clamp when sourceDurationMs is non-finite or non-positive', () => {
    expect(clampClipRange(1000, 9000, NaN)).toEqual({ inPointMs: 1000, outPointMs: 9000, clamped: false })
    expect(clampClipRange(1000, 9000, 0)).toEqual({ inPointMs: 1000, outPointMs: 9000, clamped: false })
    expect(clampClipRange(1000, 9000, -5)).toEqual({ inPointMs: 1000, outPointMs: 9000, clamped: false })
  })

  it('repairs out <= in by giving the clip a minimal 1ms span and reports clamped', () => {
    // out below in is corrupt; clamp keeps it loadable rather than blocking.
    const r = clampClipRange(5000, 3000, 10000)
    expect(r.inPointMs).toBe(5000)
    expect(r.outPointMs).toBe(5001)
    expect(r.clamped).toBe(true)
  })

  it('repairs out === in to a minimal span', () => {
    expect(clampClipRange(4000, 4000, 10000)).toEqual({
      inPointMs: 4000,
      outPointMs: 4001,
      clamped: true,
    })
  })

  it('treats a NaN in point as 0 and a NaN out point as the source duration', () => {
    expect(clampClipRange(NaN, 4000, 10000)).toEqual({ inPointMs: 0, outPointMs: 4000, clamped: true })
    expect(clampClipRange(1000, NaN, 10000)).toEqual({ inPointMs: 1000, outPointMs: 10000, clamped: true })
  })

  it('rounds fractional inputs to whole ms (the unit is integer ms)', () => {
    expect(clampClipRange(1000.4, 3999.6, 10000)).toEqual({
      inPointMs: 1000,
      outPointMs: 4000,
      clamped: true,
    })
  })

  it('clamps an in point that exceeds the source duration to keep a 1ms span below it', () => {
    // in beyond the source: floor out at sourceDurationMs, then back in off by 1ms.
    const r = clampClipRange(12000, 13000, 10000)
    expect(r.outPointMs).toBe(10000)
    expect(r.inPointMs).toBe(9999)
    expect(r.clamped).toBe(true)
  })
})
