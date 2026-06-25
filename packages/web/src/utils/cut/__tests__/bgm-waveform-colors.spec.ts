import { describe, it, expect } from 'vitest'
import { BGM_WAVEFORM_COLORS } from '../fork-contract'

// Regression guard for openimago-r7to: the BGM lane was blank because no
// waveColor was set, so WaveSurfer drew in its invisible default. These colors
// are the source of truth the fork waveform patch passes to WaveSurfer. If either
// silently became empty/invalid, the lane would go blank again — so assert both
// are concrete, non-empty 6-digit hex (a value WaveSurfer can paint).
const HEX6 = /^#[0-9a-fA-F]{6}$/

describe('BGM_WAVEFORM_COLORS', () => {
  it('defines both a wave and a progress color', () => {
    expect(BGM_WAVEFORM_COLORS).toHaveProperty('wave')
    expect(BGM_WAVEFORM_COLORS).toHaveProperty('progress')
  })

  it('is a paintable 6-digit hex for each (never empty / invalid → blank lane)', () => {
    expect(BGM_WAVEFORM_COLORS.wave).toMatch(HEX6)
    expect(BGM_WAVEFORM_COLORS.progress).toMatch(HEX6)
  })

  it('uses a green-dominant wave color (matches the canonical green lane)', () => {
    // Parse the hex and assert green is the dominant channel — guards against an
    // accidental non-green value drifting in.
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(BGM_WAVEFORM_COLORS.wave.slice(i, i + 2), 16),
    ) as [number, number, number]
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })
})
