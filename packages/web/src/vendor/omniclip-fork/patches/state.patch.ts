// PATCH — omniclip transition primitive (openimago-uyd0, spike point 3 gap).
//
// Replaces/extends these omniclip@1.0.7 sources:
//   s/context/types.ts      — HistoricalState gains `transitions: OmniTransition[]`
//   s/context/state.ts      — historical_state initial `transitions: []`
//   s/context/actions.ts    — historical_actions gain add_transition/remove_transition
//
// When the fork becomes a real git fork, apply this as edits to those three
// files. Vendored here as a documented override so re-applying on upgrade is
// mechanical. omniclip's AppCore/history already makes any field on
// HistoricalState undoable, so transitions get undo/redo for free.
//
// BROWSER-ONLY (imports omniclip internal paths).

import { generate_id } from '@benev/slate/x/tools/generate_id.js'
import type { OmniTransition } from 'src/utils/cut/fork-contract'
import { upsertTransition, removeTransition } from 'src/utils/cut/fork-logic'

// ── types.ts: add to HistoricalState ──────────────────────────────────────────
//
//   export interface HistoricalState {
//     effects: AnyEffect[]
//     tracks: XTrack[]
//  +  transitions: OmniTransition[]
//   }

// ── state.ts: add to historical_state initial value ───────────────────────────
//
//   export const historical_state: HistoricalState = {
//     tracks: [ ... ],
//     effects: [],
//  +  transitions: [],
//   }

// ── actions.ts: add to historical_actions ─────────────────────────────────────
// (shown as the literal action bodies to splice into actionize_historical({...}))

export const transition_actions = {
  add_transition:
    (state: { transitions: OmniTransition[] }) =>
    (transition: OmniTransition) => {
      // delegate to the unit-tested reducer (src/utils/cut/fork-logic.ts)
      state.transitions = upsertTransition(state.transitions, transition)
    },
  remove_transition:
    (state: { transitions: OmniTransition[] }) =>
    (afterEffectId: string) => {
      state.transitions = removeTransition(state.transitions, afterEffectId)
    },
}

// Re-export so the patch module owns the id helper omniclip uses elsewhere
// (kept to mirror omniclip's actions.ts import surface).
export { generate_id }
