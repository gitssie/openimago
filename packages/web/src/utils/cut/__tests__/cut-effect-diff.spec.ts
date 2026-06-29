import { describe, it, expect } from 'vitest'
import {
  classifyEffectDiff,
  effectsSnapshotEqual,
  advanceBaselineAfterSplit,
} from '../cut-effect-diff'
import type { DiffCutEdit } from '../cut-effect-diff'
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
  it('detects an end-point trim and reports in/out in ms', () => {
    const a = [vfx({ id: 'a', start: 0, end: 4000 }), vfx({ id: 'b', start: 0, end: 2000, start_at_position: 4000 })]
    // 'a' trimmed: end 4000 -> 3000 ms; 'b' shifts left as a consequence.
    const b = [vfx({ id: 'a', start: 0, end: 3000 }), vfx({ id: 'b', start: 0, end: 2000, start_at_position: 3000 })]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPointMs: 0, outPointMs: 3000 })
  })

  it('detects an in-point trim', () => {
    const a = [vfx({ id: 'a', start: 1000, end: 4000 })]
    const b = [vfx({ id: 'a', start: 2000, end: 4000 })]
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPointMs: 2000, outPointMs: 4000 })
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
    expect(classifyEffectDiff(a, b)).toEqual({ kind: 'trim', clipId: 'a', inPointMs: 0, outPointMs: 4000 })
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
      atMs: 4000,
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
      atMs: 4000,
      newClipId: 'a-2',
    })
  })

  it('atMs is ABSOLUTE SOURCE TIME when timeline position != source start (openimago-3xbg)', () => {
    // Live regression: omniclip's split keeps `start`/`end` in SOURCE coords and
    // `start_at_position` in TIMELINE coords. A clip that is not first has
    // start_at_position != start (e.g. s02: source [0,15069]ms placed at timeline
    // 15069ms). Splitting it mid-clip must report atMs as the SOURCE split
    // time (newEffect.start), NOT the timeline position — the backend's splitClip
    // requires atMs ∈ (inPointMs, outPointMs) in source ms.
    const a = [
      vfx({ id: 's1', file_hash: 'h1', start: 0, end: 15069, start_at_position: 0 }),
      vfx({ id: 's2', file_hash: 'h2', start: 0, end: 15069, start_at_position: 15069 }),
    ]
    // Split s2 at timeline 18720 → source split 18720 - 15069 = 3651ms.
    const b = [
      vfx({ id: 's1', file_hash: 'h1', start: 0, end: 15069, start_at_position: 0 }),
      vfx({ id: 's2', file_hash: 'h2', start: 0, end: 3651, start_at_position: 15069 }),
      vfx({ id: 's2-new', file_hash: 'h2', start: 3651, end: 15069, start_at_position: 18720 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({
      kind: 'split',
      clipId: 's2',
      atMs: 3651,
      newClipId: 's2-new',
    })
  })

  it('a concurrent late-hydration add + split is NOT misclassified as a destructive edit (openimago-3xbg)', () => {
    // Live root cause: on-edit subscribed to gestures BEFORE hydration finished,
    // so its baseline could be missing a still-importing clip. When a user split
    // landed in the same commit window as the late import, the diff saw TWO added
    // effects (the late clip + the split half) against a stale baseline. That must
    // NEVER be reported as a trim/reorder/delete (which would corrupt the cut) —
    // the safe outcome is null. (The real fix subscribes after hydration completes
    // so this collision cannot happen; this locks the diff's safe fallback.)
    const a = [
      vfx({ id: 's1', file_hash: 'h1', start: 0, end: 6840, start_at_position: 0 }),
      // baseline is missing the still-importing 's2'.
    ]
    const b = [
      vfx({ id: 's1', file_hash: 'h1', start: 0, end: 6840, start_at_position: 0 }),
      vfx({ id: 's2', file_hash: 'h2', start: 0, end: 15069, start_at_position: 6840 }),
      vfx({ id: 's1-new', file_hash: 'h1', start: 6840, end: 15069, start_at_position: 6840 }),
    ]
    expect(classifyEffectDiff(a, b)).toBeNull()
  })

  // openimago-vx2t: two splits landing in one COMMIT_DEBOUNCE window produce TWO
  // added effects, BOTH of which are clean split-halves (each abuts a same-source
  // sibling at its start). Previously this returned null → the effects entered
  // omniclip state but were never persisted (ghost ids → later reorder 400). The
  // classifier now emits the FIRST (earliest-on-track) split; on-edit drains the
  // rest by re-diffing against the post-split baseline.
  it('emits the FIRST split when two sequential splits collapse into one diff (vx2t)', () => {
    // A[0,9000] split@3000 → A[0,3000] + B[3000,9000]; then B split@6000 →
    // B[3000,6000] + B2[6000,9000]. One diff sees TWO added (B, B2), both abut.
    const a = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 9000, start_at_position: 0 })]
    const b = [
      vfx({ id: 'A', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'B', file_hash: 'fh', start: 3000, end: 6000, start_at_position: 3000 }),
      vfx({ id: 'B2', file_hash: 'fh', start: 6000, end: 9000, start_at_position: 6000 }),
    ]
    // The earliest-on-track split-half is B (its first half is A).
    expect(classifyEffectDiff(a, b)).toEqual({
      kind: 'split',
      clipId: 'A',
      atMs: 3000,
      newClipId: 'B',
    })
  })

  it('treats >1 added as a split ONLY when EVERY added effect is a clean split-half', () => {
    // Mixed case (a split-half + a non-abutting late import) must stay null so the
    // 3xbg safety holds — only the all-split-halves burst is a multi-split.
    const a = [vfx({ id: 's1', file_hash: 'h1', start: 0, end: 6840, start_at_position: 0 })]
    const b = [
      vfx({ id: 's1', file_hash: 'h1', start: 0, end: 6840, start_at_position: 0 }),
      // split-half of s1 (abuts s1.end):
      vfx({ id: 's1-new', file_hash: 'h1', start: 6840, end: 15069, start_at_position: 6840 }),
      // late import — NO sibling ends at its start (0) → NOT a split-half:
      vfx({ id: 's2', file_hash: 'h2', start: 0, end: 15069, start_at_position: 20000 }),
    ]
    expect(classifyEffectDiff(a, b)).toBeNull()
  })

  it('emits the lowest-position split first for three sequential splits', () => {
    const a = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 12000, start_at_position: 0 })]
    const b = [
      vfx({ id: 'A', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'B', file_hash: 'fh', start: 3000, end: 6000, start_at_position: 3000 }),
      vfx({ id: 'C', file_hash: 'fh', start: 6000, end: 9000, start_at_position: 6000 }),
      vfx({ id: 'D', file_hash: 'fh', start: 9000, end: 12000, start_at_position: 9000 }),
    ]
    expect(classifyEffectDiff(a, b)).toEqual({
      kind: 'split',
      clipId: 'A',
      atMs: 3000,
      newClipId: 'B',
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

describe('effectsSnapshotEqual — poll-loop change detection (openimago-rcuw)', () => {
  it('equal for identical snapshots (no edit pending)', () => {
    const a = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    const b = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    expect(effectsSnapshotEqual(a, b)).toBe(true)
  })

  it('equal for two empty snapshots', () => {
    expect(effectsSnapshotEqual([], [])).toBe(true)
  })

  it('unequal when length differs (add/delete)', () => {
    const a = [vfx({ id: 'a' })]
    const b = [vfx({ id: 'a' }), vfx({ id: 'b', start_at_position: 1000 })]
    expect(effectsSnapshotEqual(a, b)).toBe(false)
  })

  it('unequal when a trim changes start/end', () => {
    const a = [vfx({ id: 'a', start: 0, end: 4000 })]
    const b = [vfx({ id: 'a', start: 0, end: 3000 })]
    expect(effectsSnapshotEqual(a, b)).toBe(false)
  })

  it('unequal when a reorder changes start_at_position', () => {
    const a = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    const b = [vfx({ id: 'a', start_at_position: 1000 }), vfx({ id: 'b', start_at_position: 0 })]
    expect(effectsSnapshotEqual(a, b)).toBe(false)
  })

  it('unequal when an id changes (split mints a new effect)', () => {
    const a = [vfx({ id: 'a', file_hash: 'fh', start: 0, end: 6000 })]
    const b = [
      vfx({ id: 'a', file_hash: 'fh', start: 0, end: 4000 }),
      vfx({ id: 'a-new', file_hash: 'fh', start: 4000, end: 6000, start_at_position: 4000 }),
    ]
    expect(effectsSnapshotEqual(a, b)).toBe(false)
  })

  it('compares positionally — equal snapshots in the same order are equal', () => {
    // The poll always reads context.state.effects in the engine's array order,
    // so a positional compare is sufficient (and cheaper than sorting).
    const a = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    const b = [vfx({ id: 'a', start_at_position: 0 }), vfx({ id: 'b', start_at_position: 1000 })]
    expect(effectsSnapshotEqual(a, b)).toBe(true)
  })

  it('unequal when file_hash changes (media replaced)', () => {
    const a = [vfx({ id: 'a', file_hash: 'fh1' })]
    const b = [vfx({ id: 'a', file_hash: 'fh2' })]
    expect(effectsSnapshotEqual(a, b)).toBe(false)
  })
})

describe('advanceBaselineAfterSplit + drain loop (openimago-vx2t)', () => {
  it('folds one split into the baseline (first half trimmed + new half inserted)', () => {
    const baseline = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 9000, start_at_position: 0 })]
    const next = [
      vfx({ id: 'A', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'B', file_hash: 'fh', start: 3000, end: 6000, start_at_position: 3000 }),
      vfx({ id: 'B2', file_hash: 'fh', start: 6000, end: 9000, start_at_position: 6000 }),
    ]
    const folded = advanceBaselineAfterSplit(baseline, next, { clipId: 'A', newClipId: 'B' })
    const byId = Object.fromEntries(folded.map((e) => [e.id, e]))
    // A trimmed to [0,3000]; B inserted [3000,6000]; B2 NOT yet folded.
    expect(byId.A).toMatchObject({ start: 0, end: 3000 })
    expect(byId.B).toMatchObject({ start: 3000, end: 6000 })
    expect(byId.B2).toBeUndefined()
  })

  it('returns the baseline unchanged when the new effect is absent (loop-safe)', () => {
    const baseline = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 9000, start_at_position: 0 })]
    const folded = advanceBaselineAfterSplit(baseline, baseline, { clipId: 'A', newClipId: 'ghost' })
    expect(folded).toHaveLength(1)
    expect(folded[0]).toMatchObject({ id: 'A', end: 9000 })
  })

  it('drains TWO sequential splits into TWO split edits against one settled snapshot', () => {
    // This mirrors on-edit.commit()'s drain loop: classify → advance → classify,
    // proving both split halves get persisted (no ghost effect).
    const baseline = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 9000, start_at_position: 0 })]
    const next = [
      vfx({ id: 'A', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'B', file_hash: 'fh', start: 3000, end: 6000, start_at_position: 3000 }),
      vfx({ id: 'B2', file_hash: 'fh', start: 6000, end: 9000, start_at_position: 6000 }),
    ]
    const emitted: DiffCutEdit[] = []
    let working = baseline as ReturnType<typeof advanceBaselineAfterSplit>
    for (let guard = 0; guard < 10; guard++) {
      const edit = classifyEffectDiff(working, next)
      if (!edit) break
      emitted.push(edit)
      if (edit.kind === 'split') {
        working = advanceBaselineAfterSplit(working, next, edit)
      } else {
        break
      }
    }
    expect(emitted).toEqual([
      { kind: 'split', clipId: 'A', atMs: 3000, newClipId: 'B' },
      { kind: 'split', clipId: 'B', atMs: 6000, newClipId: 'B2' },
    ])
  })

  it('drains THREE sequential splits in order', () => {
    const baseline = [vfx({ id: 'A', file_hash: 'fh', start: 0, end: 12000, start_at_position: 0 })]
    const next = [
      vfx({ id: 'A', file_hash: 'fh', start: 0, end: 3000, start_at_position: 0 }),
      vfx({ id: 'B', file_hash: 'fh', start: 3000, end: 6000, start_at_position: 3000 }),
      vfx({ id: 'C', file_hash: 'fh', start: 6000, end: 9000, start_at_position: 6000 }),
      vfx({ id: 'D', file_hash: 'fh', start: 9000, end: 12000, start_at_position: 9000 }),
    ]
    const emitted: DiffCutEdit[] = []
    let working = baseline as ReturnType<typeof advanceBaselineAfterSplit>
    for (let guard = 0; guard < 10; guard++) {
      const edit = classifyEffectDiff(working, next)
      if (!edit || edit.kind !== 'split') break
      emitted.push(edit)
      working = advanceBaselineAfterSplit(working, next, edit)
    }
    expect(emitted.map((e) => (e.kind === 'split' ? e.newClipId : e.kind))).toEqual(['B', 'C', 'D'])
  })
})
