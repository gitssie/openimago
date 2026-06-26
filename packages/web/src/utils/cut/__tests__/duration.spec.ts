import { describe, it, expect } from 'vitest'
import { Duration } from '../duration'

describe('Duration value object (openimago-23cr)', () => {
  it('stores whole ms from fromMs and exposes .ms / .seconds', () => {
    const d = Duration.fromMs(2500)
    expect(d.ms).toBe(2500)
    expect(d.seconds).toBe(2.5)
  })

  it('rounds a fractional ms input to a whole ms', () => {
    expect(Duration.fromMs(2500.4).ms).toBe(2500)
    expect(Duration.fromMs(2500.6).ms).toBe(2501)
  })

  it('converts seconds to whole ms with fromSeconds (the UI transition-input boundary)', () => {
    expect(Duration.fromSeconds(0.5).ms).toBe(500)
    // 15.069s → 15069ms exactly, no float drift.
    expect(Duration.fromSeconds(15.069).ms).toBe(15069)
  })

  it('round-trips ms → seconds → ms without drift for whole-ms values', () => {
    const ms = 15069
    expect(Duration.fromSeconds(Duration.fromMs(ms).seconds).ms).toBe(ms)
  })

  it('serialises to an integer ms via toJSON (disk/wire is bare ms)', () => {
    expect(Duration.fromSeconds(2.5).toJSON()).toBe(2500)
    expect(JSON.stringify({ d: Duration.fromMs(3000) })).toBe('{"d":3000}')
  })

  it('treats a zero duration as a valid value', () => {
    expect(Duration.fromMs(0).ms).toBe(0)
    expect(Duration.fromSeconds(0).ms).toBe(0)
  })
})
