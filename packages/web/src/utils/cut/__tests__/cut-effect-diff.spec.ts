import { describe, it, expect } from 'vitest'
import { classifyEffectDiff } from '../cut-effect-diff'
import type { OmniVideoEffect } from '../omniclip-state.types'

// Build a minimal video effect; ms units (start/end = trim within source,
// start_at_position = x-offset on the timeline). Only fields the classifier
// reads matter, but we keep the shape honest to OmniVideoEffect.
function vfx(partial: Partial<OmniVideoEffect> & { id: string }): OmniVideoEffect {
  return {
    kind: 'video',
    start_at_position: 0,
    duration: 1000,
    start: 0,
    end: 1000,
    track: 0,
    file_hash: 'h-' + partial.id,
    name: partial.id,
    thumbnail: '',
    raw_duration: 5000,
    frames: 120,
    rect: {
      width: 1920,
      height: 1080,
      scaleX: 1,
      scaleY: 1,
      position_on_canvas: { x: 0, y: 0 },
      rotation: 0,
    },
    ...partial,
  }
}

describe('classifyEffectDiff — no change', () => {
  it('returns null when nothing changed', () => {
    const a = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    const b = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    expect(classifyEffectDiff(a, b)).toBeNull()
  })

  it('returns null for an empty -> empty diff', () => {
    expect(classifyEffectDiff([], [])).toBeNull()
  })
})

describe('classifyEffectDiff — trim', () => {
  it('detects an end-point trim and reports in/out in seconds', () => {
    const a = [vfx({ id: 'a', start: 0, end: 4000 }), vfx({ id: 'b', start: 0, end: 2000, start_at_position: 4000 })]
    // 'a' trimmed: end 4000 -> 3000 ms; 'b' shifts left as a consequence.
    const b = [vfx({ id: 'a', start: 0, end: 3000 }), vfx({ id: 'b', start: 0, end: 2000, start_at_position: 3000 })]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPoint: 0, outPoint: 3 })
  })

  it('detects an in-point trim', () => {
    const a = [vfx({ id: 'a', start: 1000, end: 4000 })]
    const b = [vfx({ id: 'a', start: 2000, end: 4000 })]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPoint: 2, outPoint: 4 })
  })

  it('trim beats the consequential position cascade (precedence)', () => {
    // Trimming 'a' shorter shifts every downstream effect's start_at_position.
    // That cascade must NOT be misread as a reorder — content change wins.
    const a = [
      vfx({ id: 'a', start: 0, end: 5000, start_at_position: 0 }),
      vfx({ id: 'b', start: 0, end: 3000, start_at_position: 5000 }),
      vfx({ id: 'c', start: 0, end: 2000, start_at_position: 8000 }),
    ]
    const b = [
      vfx({ id: 'a', start: 0, end: 4000, start_at_position: 0 }),
      vfx({ id: 'b', start: 0, end: 3000, start_at_position: 4000 }),
      vfx({ id: 'c', start: 0, end: 2000, start_at_position: 7000 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPoint: 0, outPoint: 4 })
  })
})

describe('classifyEffectDiff — split', () => {
  it('adopts the new effect id as newClipId; first half keeps its id', () => {
    // Before: one effect 'a' covering source [0,6000]ms.
    const a = [vfx({ id: 'a', file_hash: 'fh', start: 0, end: 6000, start_at_position: 0 })]
    // After split at 4s: 'a' shrinks to [0,4000]; new effect 'a-new' = [4000,6000],
    // same file_hash, placed right after.
    const b = [
      vfx({ id: 'a', file_hash: 'fh', start: 0, end: 4000, start_at_position: 0 }),
      vfx({ id: 'a-new', file_hash: 'fh', start: 4000, end: 6000, start_at_position: 4000 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({
      kind: 'split',
      clipId: 'a',
      atSeconds: 4,
      newClipId: 'a-new',
    })
  })

  it('split with other untouched clips present still pins the right sibling', () => {
    const a = [
      vfx({ id: 'x', file_hash: 'hx', start: 0, end: 2000, start_at_position: 0 }),
      vfx({ id: 'a', file_hash: 'fh', start: 1000, end: 7000, start_at_position: 2000 }),
    ]
    const b = [
      vfx({ id: 'x', file_hash: 'hx', start: 0, end: 2000, start_at_position: 0 }),
      vfx({ id: 'a', file_hash: 'fh', start: 1000, end: 4000, start_at_position: 2000 }),
      vfx({ id: 'a-2', file_hash: 'fh', start: 4000, end: 7000, start_at_position: 5000 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({
      kind: 'split',
      clipId: 'a',
      atSeconds: 4,
      newClipId: 'a-2',
    })
  })
})

describe('classifyEffectDiff — delete', () => {
  it('reports the removed clip id', () => {
    const a = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    const b = [vfx({ id: 'a', start_at_position: 0 })]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'delete', clipId: 'b' })
  })

  it('delete is reported even when survivors shift position', () => {
    const a = [
      vfx({ id: 'a', start_at_position: 0, duration: 2000 }),
      vfx({ id: 'b', start_at_position: 2000, duration: 2000 }),
      vfx({ id: 'c', start_at_position: 4000, duration: 2000 }),
    ]
    // remove 'a'; 'b' and 'c' slide left.
    const b = [
      vfx({ id: 'b', start_at_position: 0, duration: 2000 }),
      vfx({ id: 'c', start_at_position: 2000, duration: 2000 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'delete', clipId: 'a' })
  })
})

describe('classifyEffectDiff — reorder', () => {
  it('fires only when no content changed and position order differs', () => {
    const a = [
      vfx({ id: 'a', start: 0, end: 2000, start_at_position: 0 }),
      vfx({ id: 'b', start: 0, end: 3000, start_at_position: 2000 }),
    ]
    // swap: b now first, a second — same start/end, new positions.
    const b = [
      vfx({ id: 'a', start: 0, end: 2000, start_at_position: 3000 }),
      vfx({ id: 'b', start: 0, end: 3000, start_at_position: 0 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'reorder', orderedClipIds: ['b', 'a'] })
  })

  it('orderedClipIds is sorted by start_at_position regardless of array order', () => {
    const a = [
      vfx({ id: 'a', start_at_position: 0 }),
      vfx({ id: 'b', start_at_position: 1000 }),
      vfx({ id: 'c', start_at_position: 2000 }),
    ]
    // array order shuffled AND positions changed to c,a,b
    const b = [
      vfx({ id: 'b', start_at_position: 2000 }),
      vfx({ id: 'a', start_at_position: 1000 }),
      vfx({ id: 'c', start_at_position: 0 }),
    ]
    const out = classifyEffectDiff(a, b)
    expect(out).toEqual({ kind: 'reorder', orderedClipIds: ['c', 'a', 'b'] })
  })
})

describe('classifyEffectDiff — non-split additions', () => {
  it('returns null when a new effect shares no file_hash with a sibling (not a split)', () => {
    const a = [vfx({ id: 'a', file_hash: 'fha', start: 0, end: 3000, start_at_position: 0 })]
    const b = [
      vfx({ id: 'a', file_hash: 'fha', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'z', file_hash: 'fhz', start: 0, end: 2000, start_at_position: 3000 }),
    ]
    expect(classifyEffectDiff(a, b)).toBeNull()
  })

  it('returns null when the new effect shares file_hash but does not abut a sibling', () => {
    // Same media re-added as a separate clip but not produced by a split cut
    // (its start does not equal any sibling's end).
    const a = [vfx({ id: 'a', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 })]
    const b = [
      vfx({ id: 'a', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'b', file_hash: 'fh', start: 0, end: 3000, start_at_position: 3000 }),
    ]
    expect(classifyEffectDiff(a, b)).toBeNull()
  })
})
