// Transition primitive — spike point 3 gap (openimago-uyd0).
//
// omniclip 1.0.7 has no transition concept. patches/state.patch.ts adds a
// `transitions` array to the historical state + add/remove actions; this module
// is the host-facing read/write surface satisfying the contract's
// setTransition / clearTransition / readTransitions.
//
// A transition is keyed by the effect id it plays AFTER (mirrors
// CutTransition.afterClipId) so the mapper round-trips it directly. Duration is
// clamped to the adjacent clips by the pure clampTransitionDurationMs.
//
// BROWSER-ONLY: mutates omniclip's live state tree.

// omnislate is exported from context/context.js, NOT the package root. (openimago-x0p4)
import { omnislate } from 'omniclip/x/context/context.js'
import type {
  ClearTransition,
  OmniTransition,
  ReadTransitions,
  SetTransition,
} from 'src/_spike/omniclip/fork-contract'
import { clampTransitionDurationMs } from 'src/_spike/omniclip/fork-logic'

// Effects expose `id`, `start_at_position`, `duration` (omniclip types).
interface MinimalEffect {
  id: string
  start_at_position: number
  duration: number
}

function effectsSortedOnTrack(): MinimalEffect[] {
  return [...omnislate.context.state.effects]
    .filter((e) => e.kind === 'video')
    .sort((a, b) => a.start_at_position - b.start_at_position)
}

export const setTransition: SetTransition = (transition: OmniTransition) => {
  const ordered = effectsSortedOnTrack()
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
  // add_transition / remove_transition are added by patches/state.patch.ts.
  omnislate.context.actions.add_transition({
    afterEffectId: transition.afterEffectId,
    kind: transition.kind,
    durationMs,
  })
}

export const clearTransition: ClearTransition = (afterEffectId: string) => {
  omnislate.context.actions.remove_transition(afterEffectId)
}

export const readTransitions: ReadTransitions = () => {
  // `transitions` lives on the historical state after the patch.
  const state = omnislate.context.state as unknown as { transitions?: OmniTransition[] }
  return state.transitions ? [...state.transitions] : []
}
