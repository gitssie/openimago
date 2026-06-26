// PATCH — bound the TIMELINE pane to a fixed height (openimago-hamw).
//
// Drop-in replacement for @benev/construct's
//   x/elements/construct-editor/styles.css.js  → exports `styles` (+ the
//   `size_of_resize_handle_in_rem` const, re-exported unchanged)
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipConstructEditorStylesPatch), guarding the relative `./styles.css.js`
// import from construct-editor's element.js. construct-editor is a
// slate.shadow_component that does `use.styles(styles)`, so this injects straight
// into the construct-editor shadow root — the ONLY place the `.pane` / `.leaf`
// layout DOM lives.
//
// WHY (P0, user-diagnosed): the editor is a vertical construct cell with two panes
// — the MediaPlayerPanel (9:16 preview) on top and the TimelinePanel below. With
// the timeline pane sized `null` it was `flex: 1 1 auto` and FILLED all remaining
// editor height, so the omni-timeline grew very tall: tracks floated in empty
// black space and omni-timeline's `:host{overflow:scroll}` showed a vertical
// scrollbar that scrolled the ruler/clips out of view.
//
// WHY CSS, NOT construct's `size`: construct's sizing_styles(size) ALWAYS emits
// `flex: 0 0 <size>%` (a PERCENT) — there is no px option, and a percent of the
// (variable, often tall) editor host is still tall. So we bound the pane in CSS to
// a FIXED TIMELINE_PANE_PX. The pane carries an INLINE `style="flex:1 1 auto"`
// (from sizing_styles), which beats a normal stylesheet rule, so the override uses
// `!important` to win. The player pane keeps `flex:1 1 auto` (its layout `size` is
// also null now) and FLEXES to fill the height above the fixed timeline — the 9:16
// preview stays flexible (we do NOT box the player).
//
// TARGETING: both panes share class `.pane`; the TIMELINE pane is the one whose
// leaf renders `<omni-timeline>` (TimelinePanel), the player pane renders the
// media-player element. `.pane:has(omni-timeline)` selects ONLY the timeline pane
// (build target is baseline-widely-available → :has is supported). The inner
// `.leaf` is pinned to the same height so the leaf element is exactly
// TIMELINE_PANE_PX (the user's explicit requirement) with no gap.
//
// Re-exporting the upstream module from HERE does NOT loop: the resolveId guard
// only redirects the import whose importer is construct-editor/element.js; this
// file lives in src/, so its own re-import resolves to real upstream.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { css } from '@benev/slate'
import {
  styles as upstreamStyles,
  size_of_resize_handle_in_rem,
} from '@benev/construct/x/elements/construct-editor/styles.css.js'

/** Fixed timeline pane/leaf height in px — the SINGLE source of truth. The user
 *  asked for ~300px: toolbar (~46) + ruler (~10) + a few 50px tracks fit snugly
 *  with little empty space and no vertical-overflow scroll. */
export const TIMELINE_PANE_PX = 300

// Bound ONLY the timeline pane (the one hosting <omni-timeline>) and its leaf.
// `!important` to beat the inline `flex` sizing_styles writes on `.pane`. The
// player pane (no omni-timeline) is untouched → keeps flex:1 1 auto and fills the
// remaining height above, so the 9:16 preview stays flexible.
const timelinePaneBound = css`
  .pane:has(omni-timeline) {
    flex: 0 0 ${TIMELINE_PANE_PX}px !important;
    height: ${TIMELINE_PANE_PX}px;
    min-height: ${TIMELINE_PANE_PX}px;
  }

  .pane:has(omni-timeline) > .leaf {
    height: ${TIMELINE_PANE_PX}px;
    min-height: 0;
    overflow: hidden;
  }

  /* Hide the construct panel TASKBAR (the per-pane tab strip: Timeline tab, add
     "+", split-row/column, close ×). Our layout is a FIXED two-pane editor
     (MediaPlayerPanel + TimelinePanel, rebuilt each boot via reset_to_default), so
     tab switching/add/split/close is never used — the strip is pure clutter. Only
     pane.js renders \`.taskbar\`; the pane RESIZE handle is a separate \`.resizer\` in
     cell.js, so hiding this does NOT affect resize (and resize is moot for our fixed
     layout — nothing throws). Removing it also returns its height to the leaf, so
     the now-300px leaf exactly fills the 300px pane with no overflow/clipping.
     Scoped to this editor's shadow root, where .taskbar lives.
     SELECTOR: must match upstream's ".pane > .taskbar{display:flex}" (specificity
     0,2,0) — a plain ".taskbar" (0,1,0) loses to it. Equal specificity + appended
     after upstream → wins the cascade, no !important needed. */
  .pane > .taskbar {
    display: none;
  }

  /* Neutralize the focal-pane border highlight. Upstream draws a subtle 1px border
     on the focused pane (\`.pane[data-is-focal]{border-color: color-mix(... var(--alpha)
     15% ...)}\`); the user doesn't want the focused pane outlined. This override has
     EQUAL specificity (0,2,0) and is appended AFTER upstream, so it wins the cascade
     without !important. Only the focal state is touched — the pointer-locked border
     (a separate state) is left as-is. */
  .pane[data-is-focal] {
    border-color: transparent;
  }
`

// Re-export the resize-handle const unchanged (a resize util imports it from this
// module; keep the named export intact).
export { size_of_resize_handle_in_rem }

// Upstream styles first, the timeline-pane bound last so it wins the cascade.
export const styles = css`
  ${upstreamStyles}
  ${timelinePaneBound}
`
