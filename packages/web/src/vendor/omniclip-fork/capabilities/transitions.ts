// Transition primitive (openimago-uyd0 → fixed 1mcb).
//
// omniclip 1.0.7 has no transition concept AND its AppCore actions are sealed at
// construction (context.actions getter spreads the already-actualized historical
// actions), so we CANNOT inject add_transition/remove_transition onto
// context.actions at runtime — the prior code threw "remove_transition is not a
// function". (openimago-1mcb)
//
// Instead the fork owns the live transition view-state in a module-level store
// (per OmniContext, via WeakMap) using the unit-tested upsert/remove reducers.
// cut.json remains canonical (ownership model A) — the panel persists every
// transition through the cut endpoints; this store is just what the editor shows
// between hydration and the next refetch.
//
// A transition is keyed by the effect id it plays AFTER (mirrors
// CutTransition.afterClipId), duration clamped to the adjacent clips.
//
// BROWSER-ONLY: reads omniclip's live effects.

import { omnislate } from 'omniclip/x/context/context.js'
import type {
  ClearTransition,
  OmniTransition,
  ReadTransitions,
  SetTransition,
} from 'src/_spike/omniclip/fork-contract'
import {
  clampTransitionDurationMs,
  upsertTransition,
  removeTransition,
  type ForkTransition,
} from 'src/_spike/omniclip/fork-logic'

// Per-context transition store (survives re-renders; cleared with the context).
const STORE = new WeakMap<object, ForkTransition[]>()

function ctxKey(): object {
  return omnislate.context as unknown as object
}
function read(): ForkTransition[] {
  return STORE.get(ctxKey()) ?? []
}
function write(next: ForkTransition[]): void {
  STORE.set(ctxKey(), next)
}

interface MinimalEffect {
  id: string
  start_at_position: number
  duration: number
  kind: string
}

function videoEffectsSorted(): MinimalEffect[] {
  return [...(omnislate.context.state.effects as MinimalEffect[])]
    .filter((e) => e.kind === 'video')
    .sort((a, b) => a.start_at_position - b.start_at_position)
}

export const setTransition: SetTransition = (transition: OmniTransition) => {
  const ordered = videoEffectsSorted()
  const idx = ordered.findIndex((e) => e.id === transition.afterEffectId)
  if (idx < 0 || idx === ordered.length - 1) {
    // no clip after this one — nothing to transition into
    return
  }
  const before = ordered[idx]!
  const after = ordered[idx + 1]!
  const durationMs = clampTransitionDurationMs(
    transition.kind,
    transition.durationMs,
    before.duration,
    after.duration,
  )
  write(upsertTransition(read(), { ...transition, durationMs }))
}

export const clearTransition: ClearTransition = (afterEffectId: string) => {
  write(removeTransition(read(), afterEffectId))
}

export const readTransitions: ReadTransitions = () => [...read()]

/** Reset the transition store for the current context (called on hydration). */
export function resetTransitions(): void {
  write([])
}
