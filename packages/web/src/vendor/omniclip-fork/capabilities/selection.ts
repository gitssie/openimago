// Fork→host SELECTION channel (openimago-e6k1).
//
// Surfaces omniclip's currently-selected clip to the host so the Cut panel can
// show SELECTION-DRIVEN contextual controls (the transition editor appears only
// for the selected clip's following boundary). omniclip stores the selection on
// `state.selected_effect` (set/cleared by the timeline controller's
// set_selected_effect / remove_selected_effect — see controller.js); we emit its
// id, or null when nothing is selected.
//
// POLLING, not watch.track — for the SAME reason on-edit.ts polls (openimago-rcuw):
// Vite serves omniclip's bundled @benev/slate `nexus/state.js` at two URLs (a
// fingerprinted `?v=<hash>` vendor URL the AppCore dispatches on, and an
// un-fingerprinted project-source URL), so a `watch.track` subscriber's listener
// Set is never the one AppCore notifies. We instead poll `omnislate.context.state`
// on a rAF loop — the SAME `omnislate.context` read that hydration/transitions/
// on-edit use, which crosses the optimizer boundary correctly. Selection changes
// are user-paced clicks, so a per-frame id compare is trivially cheap.
//
// BROWSER-ONLY: reads omniclip's live state via rAF; excluded from repo typecheck.

import { omnislate } from 'omniclip/x/context/context.js'

/** Read the currently-selected effect id from omniclip's live state. */
function selectedEffectId(): string | null {
  // selected_effect is the full effect object (or null); we only surface its id.
  const selected = omnislate.context.state.selected_effect as { id?: string } | null | undefined
  return selected?.id ?? null
}

/**
 * Subscribe to selection changes and emit the selected clip's id (or null when
 * the selection is cleared). Fires once immediately with the current selection so
 * the host starts in sync, then once per change. Returns an unsubscribe fn.
 * Multiple subscribers are supported; each gets its own poll loop.
 */
export function onSelectionChange(cb: (effectId: string | null) => void): () => void {
  let lastSeen: string | null = selectedEffectId()
  let rafId: number | null = null
  let stopped = false

  // Emit the initial selection so the host is in sync from the first frame.
  cb(lastSeen)

  const tick = (): void => {
    if (stopped) return
    const current = selectedEffectId()
    if (current !== lastSeen) {
      lastSeen = current
      cb(current)
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return () => {
    stopped = true
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}
