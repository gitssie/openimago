// PATCH — reserve a real LEFT GUTTER on the timeline (openimago-scml).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/styles.js  → export `styles`
// (the omni-timeline COMPONENT's own shadow styles, `use.styles(styles)`),
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipTimelineStylesPatch), guarding the relative `./styles.js` import from
// omni-timeline's component.js. We RE-EXPORT upstream styles unchanged, then
// APPEND a single rule that left-pads `.timeline` by GUTTER_PX.
//
// WHY THIS, NOT padding-left on `.timeline-relative` (the coordinate-math trap):
// omniclip's component.js computes drag/playhead time from
//   bounds = .timeline-relative.getBoundingClientRect();  x = clientX - bounds.left
// and renders effects as ABSOLUTE children of `.timeline-relative` at `left:<f(t)>`
// (from its padding box). The mapping must stay inverse: a clip at time t must
// render where a drag at that x lands.
//
//   ✗ padding-left ON `.timeline-relative` desyncs: getBoundingClientRect().left is
//     the BORDER-box left (excludes padding), but absolute children position from
//     the PADDING box — so children shift by the padding while bounds.left does not.
//     Off by exactly the padding.
//
//   ✓ padding-left on the PARENT `.timeline` moves `.timeline-relative`'s ENTIRE
//     border box right by GUTTER. Then getBoundingClientRect().left = oldLeft+GUTTER
//     AND the absolute children (effects) at left:0 render at newBorderLeft+0 =
//     oldLeft+GUTTER. Both shift by GUTTER together → the mapping stays inverse, the
//     playhead (also an absolute child of `.timeline-relative`) tracks too.
//
// STRUCTURE (openimago-jtub): the toolbar used to be a sibling INSIDE the scrolling
// host, so zoom (which resizes `.timeline-relative`, e.g. 9544px) churned the scroll
// geometry and kept breaking the toolbar pin. The forked component.js now wraps ONLY
// the ruler + tracks in a new `.scroll-area`, with the Toolbar a plain bar OUTSIDE it:
//
//   :host (flex column, overflow:hidden)         ← no longer the scrollport
//     .timeline (flex column, height:100%)
//       Toolbar                                   ← plain full-width bar, not scrolling
//       .scroll-area (flex:1; min-height:0; overflow:scroll; position:relative; NO padding)  ← scrolls + grows with zoom
//         .timeline-inner (padding-left: GUTTER_PX)   ← gutter lives here, not on the scroll container
//           TimeRuler
//           .timeline-relative
//
// So this patch:
//   • moves `overflow:scroll` OFF `:host` (now `overflow:hidden`, flex column) and
//     ONTO the new `.scroll-area` (UNPADDED),
//   • makes `.timeline` a full-height flex column,
//   • puts the gutter `padding-left:GUTTER_PX` on `.timeline-inner` (the inner wrapper,
//     parent of `.timeline-relative`) — NOT on `.scroll-area`.
//
// WHY NOT pad `.scroll-area` (openimago-jo5q): the track-header chip pins into the
// gutter with `sticky; left:0; margin-left:-GUTTER_PX`, which anchors at the SCROLL
// CONTAINER's content edge. Padding the scroll container pushes that anchor to +GUTTER
// → the icon column indents ~60px instead of sitting flush-left. So the scroll
// container stays UNPADDED and the shift lives on `.timeline-inner`.
//
// COORDINATE-MATH STILL SAFE: padding-left on `.timeline-inner` (the parent of
// `.timeline-relative`) moves `.timeline-relative`'s ENTIRE border box right by GUTTER,
// so getBoundingClientRect().left AND the absolute effects (left:0) shift together —
// the drag mapping stays inverse (same as the original `.timeline` padding). The
// TimeRuler is also inside `.timeline-inner`, so its ticks shift +GUTTER with the clips
// and stay aligned. The TOOLBAR is OUTSIDE `.scroll-area`, NOT shifted, spans full width.
//
// We RE-EXPORT upstream styles then APPEND overrides (same specificity, later in the
// cascade → they win). Importing upstream from a src/ importer does NOT loop.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/styles.js'
import { GUTTER_PX } from './timeline-gutter'

// Restructure the scroll model: the host stops scrolling; the new `.scroll-area`
// scrolls and carries the gutter. Appended AFTER upstream so these win the cascade.
const restructure = css`
  :host {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* The ONLY scrolling element now: ruler + tracks scroll here and grow with zoom.
     It must have NO padding (openimago-jo5q): the track-header chip pins into the
     gutter with sticky left:0 + margin-left:-GUTTER_PX, which anchors at the SCROLL
     CONTAINER's content edge — padding here would push that anchor to +GUTTER and
     indent the icon column. The gutter shift lives on .timeline-inner below instead. */
  .scroll-area {
    flex: 1 1 auto;
    min-height: 0;
    overflow: scroll;
    position: relative;
  }

  /* Inner wrapper (parent of .timeline-relative) that carries the gutter shift. The
     ruler + clips keep their 60px gutter; the track-header sticky left:0 still anchors
     at the unpadded scroll-container x0 so the icon column sits FLUSH at the left.
     Coordinate-math safe: padding on the parent of .timeline-relative shifts its
     border box + absolute effects + drag bounds.left together (same as the original
     .timeline padding). */
  .timeline-inner {
    padding-left: ${GUTTER_PX}px;
  }
`

// Single combined export (the component passes THIS to use.styles). Upstream first,
// restructure last so the overrides win.
export const styles = css`
  ${upstreamStyles}
  ${restructure}
`
