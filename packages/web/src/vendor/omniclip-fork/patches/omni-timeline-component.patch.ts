// PATCH — restructure the omni-timeline render tree so ONLY the ruler+tracks scroll
// (openimago-jtub).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/component.js  → export `OmniTimeline`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipTimelineComponentPatch), guarding the
// `./components/omni-timeline/component.js` import from omniclip's get-components.js
// / main.js / index.js.
//
// WHY: the toolbar used to be a sibling INSIDE omni-timeline's `:host{overflow:scroll}`,
// so zoom (which resizes `.timeline-relative`, e.g. 9544px) churned the scroll
// geometry and kept breaking the toolbar's width/pin. We move the scroll boundary in
// one box: the host stops scrolling, a NEW `.scroll-area` wraps ONLY the TimeRuler +
// `.timeline-relative` and scrolls/grows with zoom, and the Toolbar is a plain bar
// ABOVE it (outside the scroll). Target tree:
//
//   :host (flex column, overflow:hidden)        — omni-timeline-styles.patch.ts
//     .timeline (flex column, height:100%)
//       Toolbar                                  ← plain full-width bar, NOT scrolling
//       .scroll-area (flex:1; min-height:0; overflow:scroll; position:relative; NO padding)
//         .timeline-inner (padding-left: GUTTER_PX)   ← the gutter lives HERE, not on
//           TimeRuler                                 the scroll container, so the
//           .timeline-relative (width = calculate_timeline_width)   track-header sticky
//             Playhead / tracks / effects / ProposalIndicator        left:0 anchors at x0
//
// WHY .timeline-inner (openimago-jo5q): the track-header chip pins into the gutter via
// `sticky; left:0; margin-left:-GUTTER_PX`, which anchors at the SCROLL CONTAINER's
// content edge. If the scroll container itself is padded, left:0 anchors at +GUTTER
// and the icon column is indented. So the scroll container (.scroll-area) stays
// UNPADDED and the GUTTER_PX shift lives on the inner wrapper (parent of
// .timeline-relative) — same coordinate-math as the original `.timeline` padding.
//
// FAITHFUL: every handler (playhead_drag_over / effect_drag_over / augmented_dragover),
// render_tracks, render_effects, the StateHandler wrapper, and the use.mount dragover
// listener are reproduced VERBATIM from upstream — ONLY the render tree changes (wrap
// + reorder). The drag handlers query `.timeline-relative`'s getBoundingClientRect()
// (viewport-relative, scroll-agnostic), so they are correct unchanged.
//
// IMPORTS — read carefully: the per-view fork patches (Toolbar, Track, TimeRuler) and
// the component styles patch are wired via resolveId gates that fire ONLY when the
// importer is the REAL `omni-timeline/component.js`. Since THIS file replaces that
// component (and lives in src/), those gates would NOT fire for our imports — so we
// import the FORK views + fork styles DIRECTLY here. Everything else (Playhead,
// effects, StateHandler, ProposalIndicator, calculate_timeline_width, shadow_component)
// comes from real upstream (src/ importer → not redirected → no loop).
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { Op, html } from '@benev/slate'
import { repeat } from 'lit/directives/repeat.js'
import { shadow_component } from 'omniclip/x/context/context.js'
import { Playhead } from 'omniclip/x/components/omni-timeline/views/playhead/view.js'
import { TextEffect } from 'omniclip/x/components/omni-timeline/views/effects/text-effect.js'
import { AudioEffect } from 'omniclip/x/components/omni-timeline/views/effects/audio-effect.js'
import { ImageEffect } from 'omniclip/x/components/omni-timeline/views/effects/image-effect.js'
import { StateHandler } from 'omniclip/x/views/state-handler/view.js'
import { ProposalIndicator } from 'omniclip/x/components/omni-timeline/views/indicators/proposal-indicator.js'
import { calculate_timeline_width } from 'omniclip/x/components/omni-timeline/utils/calculate_timeline_width.js'
// Fork views + styles (imported DIRECTLY — see the IMPORTS note above). VideoEffect
// is the fork version too: its resolveId gate fires on ANY omniclip importer, but
// our importer is src/, so importing upstream here would bypass the filmstrip patch.
import { styles } from './omni-timeline-styles.patch'
import { Track } from './track-view.patch'
import { Toolbar } from './toolbar.patch'
import { TimeRuler } from './time-ruler-view.patch'
import { VideoEffect } from './video-effect.patch'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEvent = any

export const OmniTimeline = shadow_component((use) => {
  use.styles(styles)
  use.watch(() => use.context.state)
  const state = use.context.state
  const effect_drag = use.context.controllers.timeline.effect_drag
  const playhead_drag = use.context.controllers.timeline.playhead_drag
  const handler = use.context.controllers.timeline.effect_trim_handler
  use.mount(() => {
    window.addEventListener('dragover', augmented_dragover)
    return () => removeEventListener('dragover', augmented_dragover)
  })
  const playhead_drag_over = (event: AnyEvent) => {
    const timeline = use.shadow.querySelector('.timeline-relative')
    const bounds = timeline?.getBoundingClientRect()
    const x = event.clientX - bounds.left
    if (x >= 0) {
      playhead_drag.dropzone.dragover({ x })(event)
    } else playhead_drag.dropzone.dragover({ x: 0 })(event)
  }
  const effect_drag_over = (event: AnyEvent) => {
    const timeline = use.shadow.querySelector('.timeline-relative')
    const indicator = event.target.part.value
    const bounds = timeline?.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    effect_drag.dropzone.dragover({
      coordinates: [x >= 0 ? x : 0, y >= 0 ? y : 0],
      indicator: indicator,
    })(event)
  }
  function augmented_dragover(event: AnyEvent) {
    if (use.context.controllers.timeline.effect_trim_handler.effect_resize_handle_drag.grabbed) {
      handler.effect_resize_handle_drag.dropzone.dragover({
        x: use.element.clientLeft,
        client_x: event.clientX,
      })(event)
      return
    }
    playhead_drag_over(event)
    effect_drag_over(event)
  }
  const render_tracks = () =>
    use.context.state.tracks.map((_track: AnyEvent, i: number) =>
      Track([i], { attrs: { part: 'add-track-indicator' } }),
    )
  const render_effects = () =>
    repeat(
      use.context.state.effects,
      (effect: AnyEvent) => effect.id,
      (effect: AnyEvent) => {
        if (effect.kind === 'audio') {
          return AudioEffect([effect, use.element])
        } else if (effect.kind === 'video') {
          return VideoEffect([effect, use.element])
        } else if (effect.kind === 'text') {
          return TextEffect([effect, use.element])
        } else if (effect.kind === 'image') {
          return ImageEffect([effect, use.element])
        }
      },
    )
  return StateHandler(
    Op.all(use.context.helpers.ffmpeg.is_loading.value, use.context.helpers.ffmpeg.is_loading.value),
    () => html`
      <div class="timeline">
        ${Toolbar([use.element])}
        <div class="scroll-area">
          <div class="timeline-inner">
            ${TimeRuler([use.element])}
            <div
              style="width: ${calculate_timeline_width(state.effects, state.zoom)}px"
              class="timeline-relative"
            >
              ${Playhead([])} ${render_tracks()} ${render_effects()} ${ProposalIndicator()}
            </div>
          </div>
        </div>
      </div>
    `,
  )
})
