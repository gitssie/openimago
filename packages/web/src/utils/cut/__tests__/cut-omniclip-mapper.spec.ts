import { describe, it, expect } from 'vitest'
import { cutToOmniclipState, omniclipStateToCut } from '../cut-omniclip-mapper'
import type { EpisodeCut, ResolvedShotMedia } from '../cut-types'

function media(sourceShotId: string, durationSeconds: number): ResolvedShotMedia {
  return {
    sourceShotId,
    url: `https://cdn.example/${sourceShotId}.mp4`,
    fileHash: `hash-${sourceShotId}`,
    rawDurationSeconds: durationSeconds,
    frames: Math.round(durationSeconds * 25),
    thumbnail: `data:image/png;base64,thumb-${sourceShotId}`,
    name: `${sourceShotId}.mp4`,
  }
}

const baseCut: EpisodeCut = {
  schemaVersion: 2,
  episodeId: 'ep_001',
  clips: [
    { id: 'clip-b', sourceShotId: 'shot_2', inPointMs: 1000, outPointMs: 4000, order: 1 },
    { id: 'clip-a', sourceShotId: 'shot_1', inPointMs: 0, outPointMs: 2500, order: 0 },
  ],
  transitions: [{ afterClipId: 'clip-a', kind: 'dissolve', durationSeconds: 0.5 }],
  updatedAt: '2026-06-18T00:00:00.000Z',
}

const mediaTable: Record<string, ResolvedShotMedia> = {
  shot_1: media('shot_1', 10),
  shot_2: media('shot_2', 10),
}
const resolveMedia = (id: string) => mediaTable[id]
const resolveShotId = (hash: string) =>
  Object.values(mediaTable).find((m) => m.fileHash === hash)?.sourceShotId

describe('cut <-> omniclip mapper (production)', () => {
  it('hydrates clips onto track 0 in order as direct ms (no conversion)', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, resolveMedia)
    expect(orphans).toEqual([])
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a', 'clip-b'])
    expect(state.effects[0]).toMatchObject({ start: 0, end: 2500, duration: 2500, start_at_position: 0 })
    expect(state.effects[1]).toMatchObject({ start: 1000, end: 4000, duration: 3000, start_at_position: 2500 })
  })

  it('keeps the heavy base64 thumbnail OUT of omniclip state (openimago-9frm)', () => {
    // slate StateTree.transmute structuredClones the whole effects state x2 on EVERY action
    // (drop/trim/ripple). A base64 data-URL thumbnail (tens-hundreds KB) on each effect would
    // be cloned every edit — multiple MB of dead weight, since the embedded editor never reads
    // effect.thumbnail (the timeline filmstrip uses the sprite/filmstrip_url). So the mapper
    // must NOT thread the heavy base64 onto the hydrated effect, even though the source media
    // carries one.
    const { state } = cutToOmniclipState(baseCut, resolveMedia)
    let videoCount = 0
    for (const e of state.effects) {
      if (e.kind === 'video') {
        videoCount++
        expect(e.thumbnail).toBe('')
      }
    }
    expect(videoCount).toBeGreaterThan(0)
    // sanity: the source media DID carry a heavy base64 thumbnail, so the assertion isn't vacuous
    const m = resolveMedia('shot_1')
    expect(m?.thumbnail).toContain('base64')
  })

  it('clamps a clip whose out point exceeds its source-duration snapshot (openimago-lknv)', () => {
    const overlongCut: EpisodeCut = {
      ...baseCut,
      clips: [
        // out 9000 > source 5000 → effect end clamped to 5000.
        { id: 'clip-a', sourceShotId: 'shot_1', inPointMs: 0, outPointMs: 9000, order: 0, sourceDurationMs: 5000 },
      ],
    }
    const { state } = cutToOmniclipState(overlongCut, resolveMedia)
    expect(state.effects[0]).toMatchObject({ start: 0, end: 5000, duration: 5000 })
  })

  it('round-trips back to EpisodeCut without losing schema-owned fields', () => {
    const { state } = cutToOmniclipState(baseCut, resolveMedia)
    const back = omniclipStateToCut(
      state,
      { schemaVersion: 2, episodeId: 'ep_001', transitions: baseCut.transitions },
      resolveShotId,
      '2026-06-18T01:00:00.000Z',
    )
    expect(back.clips).toEqual([
      { id: 'clip-a', sourceShotId: 'shot_1', inPointMs: 0, outPointMs: 2500, order: 0 },
      { id: 'clip-b', sourceShotId: 'shot_2', inPointMs: 1000, outPointMs: 4000, order: 1 },
    ])
    expect(back.transitions).toEqual(baseCut.transitions)
  })

  it('tolerates orphan clips (deleted source Shot) instead of dropping them', () => {
    const { state, orphans } = cutToOmniclipState(baseCut, (id) =>
      id === 'shot_2' ? undefined : resolveMedia(id),
    )
    expect(state.effects.map((e) => e.id)).toEqual(['clip-a'])
    expect(orphans.map((c) => c.id)).toEqual(['clip-b'])
  })
})

// ── No-gap ripple-track invariant (openimago-4rdj) ─────────────────────────────
//
// The video track is a NO-GAP, NO-OVERLAP ripple: a clip's on-track position is
// DERIVED from order + the spans of the clips before it (cursorMs), never
// persisted. A user can drag a clip in omniclip to leave a temporary gap or
// overlap (any start_at_position); on readback we re-derive `order` from the
// on-track position, and the next hydrate snaps every clip flush against its
// predecessor again. These tests lock that round-trip behaviour.

import type { OmniHistoricalState, OmniVideoEffect } from '../omniclip-state.types'

/** A minimal video effect with an explicit on-track position + source trim. */
function videoEffect(
  id: string,
  fileHash: string,
  startAtPosition: number,
  start: number,
  end: number,
): OmniVideoEffect {
  return {
    kind: 'video',
    id,
    start_at_position: startAtPosition,
    duration: end - start,
    start,
    end,
    track: 0,
    file_hash: fileHash,
    name: id,
    thumbnail: '',
    raw_duration: 10000,
    frames: 250,
    rect: {
      width: 1080,
      height: 1920,
      scaleX: 1,
      scaleY: 1,
      position_on_canvas: { x: 0, y: 0 },
      rotation: 0,
    },
  }
}

const prev = { schemaVersion: 2 as const, episodeId: 'ep_001', transitions: [] }

describe('no-gap ripple invariant', () => {
  it('hydrate lays clips flush end-to-end regardless of their order field (cursorMs)', () => {
    // Three clips of spans 2000 / 3000 / 1500 ms → positions 0, 2000, 5000.
    const cut: EpisodeCut = {
      schemaVersion: 2,
      episodeId: 'ep_001',
      clips: [
        { id: 'c0', sourceShotId: 'shot_1', inPointMs: 0, outPointMs: 2000, order: 0 },
        { id: 'c1', sourceShotId: 'shot_2', inPointMs: 1000, outPointMs: 4000, order: 1 },
        { id: 'c2', sourceShotId: 'shot_1', inPointMs: 500, outPointMs: 2000, order: 2 },
      ],
      transitions: [],
      updatedAt: 't',
    }
    const { state } = cutToOmniclipState(cut, resolveMedia)
    expect(state.effects.map((e) => e.start_at_position)).toEqual([0, 2000, 5000])
    // each clip's position equals the running sum of prior spans (no gap/overlap).
    let cursor = 0
    for (const e of state.effects) {
      expect(e.start_at_position).toBe(cursor)
      cursor += e.duration
    }
  })

  it('readback derives order strictly from on-track position, NOT array order', () => {
    // omniclip array order is shuffled and positions are arbitrary (with a GAP).
    const state: OmniHistoricalState = {
      effects: [
        videoEffect('b', 'hash-shot_2', 9000, 1000, 4000), // 3rd on track (gap before it)
        videoEffect('a', 'hash-shot_1', 0, 0, 2000), // 1st
        videoEffect('c', 'hash-shot_2', 2000, 0, 1500), // 2nd
      ],
      tracks: [{ id: 'track-0' }],
    }
    const back = omniclipStateToCut(state, prev, resolveShotId, 't')
    // order recovered from start_at_position ascending: a(0), c(2000), b(9000).
    expect(back.clips.map((c) => c.id)).toEqual(['a', 'c', 'b'])
    expect(back.clips.map((c) => c.order)).toEqual([0, 1, 2])
  })

  it('a user-dragged gap/overlap is absorbed to a no-gap track after one round-trip', () => {
    // User left an overlap (b starts at 1500 while a ends at 2000) and a gap
    // (c starts at 9000). Round-trip: readback fixes order, re-hydrate snaps flush.
    const dragged: OmniHistoricalState = {
      effects: [
        videoEffect('a', 'hash-shot_1', 0, 0, 2000), // span 2000
        videoEffect('b', 'hash-shot_2', 1500, 0, 3000), // overlaps a; span 3000
        videoEffect('c', 'hash-shot_1', 9000, 0, 1000), // big gap; span 1000
      ],
      tracks: [{ id: 'track-0' }],
    }
    const cut = omniclipStateToCut(dragged, prev, resolveShotId, 't')
    // order recovered by position (a, b, c) and trim preserved.
    expect(cut.clips.map((c) => [c.id, c.order])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ])
    // Re-hydrate: positions are now flush (0, 2000, 5000) — gap+overlap gone.
    const { state: rehydrated } = cutToOmniclipState(cut, resolveMedia)
    expect(rehydrated.effects.map((e) => e.start_at_position)).toEqual([0, 2000, 5000])
    let cursor = 0
    for (const e of rehydrated.effects) {
      expect(e.start_at_position).toBe(cursor)
      cursor += e.duration
    }
  })

  it('round-trips order exactly for an arbitrary permutation of positions', () => {
    // Positions deliberately non-contiguous and out of array order.
    const state: OmniHistoricalState = {
      effects: [
        videoEffect('x', 'hash-shot_1', 5000, 0, 1000),
        videoEffect('y', 'hash-shot_2', 100, 0, 2000),
        videoEffect('z', 'hash-shot_1', 50000, 0, 500),
        videoEffect('w', 'hash-shot_2', 800, 0, 1500),
      ],
      tracks: [{ id: 'track-0' }],
    }
    const back = omniclipStateToCut(state, prev, resolveShotId, 't')
    // ascending by position: y(100), w(800), x(5000), z(50000).
    expect(back.clips.map((c) => c.id)).toEqual(['y', 'w', 'x', 'z'])
    expect(back.clips.map((c) => c.order)).toEqual([0, 1, 2, 3])
  })
})
