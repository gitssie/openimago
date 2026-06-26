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
// RULER + TOOLBAR ALIGNMENT FOR FREE: `.time-ruler` and the toolbar are SIBLING
// flex children of `.timeline` (a flex-direction:column). Padding the column left
// shifts the ruler tick origin AND the toolbar by the SAME GUTTER, so the ticks
// stay over the shifted clips and the toolbar stays over the clip area — no
// per-view ruler patch needed.
//
// The header CHIP itself is pulled back into the opened 0..GUTTER band by
// track-view.patch.ts (sticky, negative margin), so nothing overlaps the clips.
//
// Importing the upstream module from HERE does NOT loop: the resolveId guard only
// redirects imports whose importer is inside the omniclip package; this file lives
// in src/, so its import resolves to real upstream.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/styles.js'
import { GUTTER_PX } from './timeline-gutter'

// Reserve the left gutter on the flex COLUMN. Parent padding moves the ruler,
// `.timeline-relative` (and its absolute effects + drag bounds, in lockstep) and
// the toolbar all right by the same amount — coordinate-math safe (see header).
const gutterShift = css`
  .timeline {
    padding-left: ${GUTTER_PX}px;
  }
`

// Single combined export (the component passes THIS to use.styles). Upstream
// first, gutter shift last.
export const styles = css`
  ${upstreamStyles}
  ${gutterShift}
`
