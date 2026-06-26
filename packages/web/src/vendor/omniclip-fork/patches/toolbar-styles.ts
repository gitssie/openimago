// PATCH STYLES — single combined control bar (openimago-4qwj).
//
// The shadow styles for the fork Toolbar (toolbar.patch.ts). Reshapes omniclip's
// split toolbar into ONE restrained horizontal control bar matching the approved
// design (docs/images/cut_panel.png): edit/clip ops on the LEFT, playback
// transport + current/total time in the CENTER, fullscreen + zoom on the RIGHT.
//
// FLAT imago look: theme via the inherited --imago-* / --omni-* vars (they cross
// the shadow boundary), no heavy glow (NO --imago-glow-*). The active play
// affordance is the single cyan accent (mirrors StoryCutPanel's design note).
//
// NOTE on layout (CRITICAL): the omni-timeline :host is \`overflow: scroll\` and
// the toolbar lives INSIDE that horizontally-scrollable container, whose CONTENT
// width follows the full timeline length (e.g. ~2976px), NOT the visible pane.
// So a child \`width:100%\` resolves to the scroll width and a \`space-between\` row
// throws the center/right groups thousands of px off-screen. That is exactly why
// upstream pinned the toolbar with \`position:fixed\` + an explicit px width.
//
// We instead pin \`.tools\` with \`position: sticky; left: 0\` (stays at the visible
// left edge as the timeline scrolls) and take its width from the inline
// \`width: <timeline.offsetWidth>px\` the view sets (the VISIBLE pane width). That
// makes \`space-between\` spread left | center | right across the visible bar.
//
// VERTICAL PIN (openimago-xgoi): the omni-timeline :host is also VERTICALLY
// scrollable, so the toolbar must pin to the top too or it scrolls away. The
// element whose containing block is the full-height \`.timeline\` flex column is the
// toolbar's OWN host element (it is a flex child of \`.timeline\`; \`.toolbar\`/\`.tools\`
// inside the host shadow root are only one row tall, so a sticky-top on THEM would
// unstick immediately). So the vertical pin goes on \`:host\`:
// \`position: sticky; top: 0\` keeps the whole bar at the top of the scrollport
// across the entire vertical range, while \`.tools{sticky; left:0}\` keeps it at the
// left during horizontal scroll (nested sticky → bar stays top-left). The host is
// the FIRST child of \`.timeline\`, so later siblings (ruler, .timeline-relative)
// would paint over it — \`z-index\` lifts it above them (and above the ruler's
// z-index:10 hover indicator / playhead). An OPAQUE background (flat \`--imago-bg-deep\`,
// the lane/gutter family) stops scrolled clips/ruler bleeding through the bar.
//
// BROWSER-ONLY (imports @benev/slate \`css\`).

import { css } from '@benev/slate'
import { GUTTER_PX } from './timeline-gutter'

export const combinedToolbarStyles = css`
  :host {
    /* VERTICAL pin only. sticky + top:0 holds the bar at the top of the scrollport
       across the whole vertical range (the host's containing block is the
       full-height ".timeline" column). The HORIZONTAL pin lives on .tools below, NOT
       here — see the .toolbar note for why .tools now has a genuine ~3000px
       containing block. z-index lifts the bar above later-sibling scrolled content
       (ruler indicator z-index:10, playhead, clips); opaque bg prevents bleed.

       display: BLOCK (not flex): a flex host makes ".toolbar" (its single item) size
       to CONTENT on the horizontal axis (~1218px), which would make .tools's
       containing block too narrow and release sticky-left mid-scroll → drift. As a
       block host, the block-level ".toolbar" fills the host's full width (the host
       stretches to ".timeline"'s ~3000px column width), so .tools pins across the
       entire horizontal scroll — exactly like .track-header inside the 3000px
       .timeline-relative. */
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--imago-bg-deep, #0a0a0f);
    display: block;
    min-height: 46px;
    --transition: 0.2s;
    /* CURRENT timecode reads as bright neutral off-white — the UPDATED reference
       (docs/images/cut_panel.png) shows it brighter than the muted-grey total,
       NOT the amber the earlier cut_panel_v2 pass used. Scoped to this bar via a
       token (no global token is the right semantic) so a future re-tint is local. */
    --cut-time-current: var(--imago-text-primary, #e8e8ec);
  }

  /* .toolbar is the CONTAINING BLOCK for the horizontally-sticky .tools, so it MUST
     span the full ~3000px ".timeline" width (like ".track" does for ".track-header")
     or sticky-left releases mid-scroll. As a block element under the block host it
     fills the host's full width; width:100% makes that explicit. NOT display:flex —
     flex would shrink it to content (~1218px) and reintroduce the drift. */
  .toolbar {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  /* The bar SPREADS its three groups across the FULL visible pane (CapCut-style):
     LEFT (.flex — undo/redo/split) at the far left, CENTER (.transport — timecode /
     play) reads centered, RIGHT (.right — mute/fullscreen/zoom) at the far right.
     "justify-content: space-between" does the spread; the view sets an inline
     "width: <paneWidth>px" measured from the scrollport's clientWidth (reliable, via
     ResizeObserver — the old inline offsetWidth read stale ~455) so the groups span
     the visible width, not the ~3000px scroll content. The HORIZONTAL pin is here and
     here only: "position: sticky; left: 0" pins the box to the scrollport's left
     edge, and because its containing block (.toolbar) now genuinely spans the full
     ~3000px ".timeline" width (see the .toolbar note), sticky-left HOLDS across the
     entire horizontal scroll — exactly like ".track-header" inside the 3000px
     ".timeline-relative". No margin:auto; "max-width: 100%" guards the pre-measure
     frame (width:auto).

     ZERO pre-stick travel: ".timeline" has padding-left: GUTTER_PX, so .tools's
     NATURAL (scroll=0) left edge would be at ~GUTTER_PX while its sticky THRESHOLD is
     left:0 — for the first GUTTER_PX of scroll the bar moves with the content, then
     snaps to x0 (the ~60px leftward jump the user saw). The cancel MUST be on the
     sticky element's own flow, not just the host (the host's margin did not reach
     .tools's flow origin). "margin-left: -GUTTER_PX" pulls .tools's static position to
     viewport x0 so natural left == sticky threshold == 0 → the bar (and the split
     icon) sits at the SAME x before and after scroll, like the track-header. */
  .tools {
    position: sticky;
    left: 0;
    margin-left: -${GUTTER_PX}px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    max-width: 100%;
    gap: 0.75em;
    padding: 6px 12px;
    /* Opaque bar surface (matches the host) so scrolled clips/ruler never show
       through the controls. */
    background: var(--imago-bg-deep, #0a0a0f);
  }

  button {
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 6px;
    color: var(--imago-text-muted, #989898);
    fill: currentColor;
    transition: color var(--transition) ease, background var(--transition) ease;
  }

  button:hover:not([disabled]) {
    color: var(--imago-text-primary, #fff);
    background: color-mix(in srgb, var(--imago-text-primary, #fff) 8%, transparent);
  }

  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--imago-border-cyan-active, rgba(0, 224, 255, 0.4));
  }

  button[disabled] {
    opacity: 0.4;
    cursor: default;
  }

  svg {
    width: 20px;
    height: 20px;
    display: block;
  }

  /* ── LEFT: history + clip ops (structure preserved from upstream) ── */
  .flex {
    display: flex;
    align-items: center;
    gap: 0.25em;
  }

  .history {
    display: flex;
    fill: var(--imago-text-faint, #555454);
  }

  .history button[data-past],
  .history button[data-future] {
    fill: var(--imago-text-muted, #989898);
  }

  .split {
    margin: 0 0.4em;
  }

  .split svg,
  .remove svg {
    width: 17px;
    height: 17px;
  }

  .clean {
    margin-left: 0.75em;
    color: var(--imago-neon-pink, #f13131);
  }

  .clean:hover:not([disabled]) {
    color: var(--imago-neon-pink, #f13131);
  }

  /* ── CENTER: transport + current/total time ── */
  .transport {
    display: flex;
    align-items: center;
    gap: 0.35em;
  }

  .transport .seek svg {
    width: 18px;
    height: 18px;
  }

  /* Play/pause: NEUTRAL white glyph on a SUBTLE filled disc (the UPDATED
     reference cut_panel.png shows a soft charcoal circle behind the glyph, not a
     crisp 1px ring). White glyph, not cyan — cyan is reserved for the
     selected-clip border only. Flat, no glow. */
  .transport .playpause {
    color: var(--imago-text-primary, #fff);
    width: 34px;
    height: 34px;
    border-radius: 999px;
    border: none;
    background: color-mix(in srgb, var(--imago-text-primary, #fff) 9%, transparent);
  }

  .transport .playpause:hover:not([disabled]) {
    color: var(--imago-text-primary, #fff);
    background: color-mix(in srgb, var(--imago-text-primary, #fff) 15%, transparent);
  }

  .timecode {
    display: flex;
    align-items: baseline;
    gap: 0.35em;
    margin-left: 0.6em;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--imago-text-faint, #888);
    white-space: nowrap;
  }

  /* Current time reads bright neutral off-white; separator + total stay muted grey. */
  .timecode .current {
    color: var(--cut-time-current, #e8e8ec);
  }

  .timecode .sep,
  .timecode .total {
    color: var(--imago-text-faint, #888);
  }

  /* ── RIGHT: mute · fullscreen · zoom-out · slider · zoom-in ── */
  .right {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  /* Master-mute speaker: muted state reads as the theme pink (an "off" warning),
     matching the flat look; the on state uses the standard muted button color. */
  .mute[data-muted='true'],
  .mute[data-muted='true']:hover:not([disabled]) {
    color: var(--imago-neon-pink, #f13131);
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 0.25em;
  }

  /* Flat zoom slider sitting between the magnifier buttons. Thin neutral track,
     small neutral thumb (cyan is reserved for the selected clip); tokens cross the
     shadow boundary. Native appearance reset so it matches the bar chrome. */
  .zoom-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 96px;
    height: 4px;
    border-radius: 999px;
    background: var(--imago-border-soft, rgba(255, 255, 255, 0.14));
    outline: none;
    cursor: pointer;
    margin: 0 2px;
  }

  .zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--imago-text-primary, #e8e8ec);
    border: none;
    cursor: pointer;
  }

  .zoom-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: var(--imago-text-primary, #e8e8ec);
    border: none;
    cursor: pointer;
  }

  .zoom-slider:focus-visible {
    box-shadow: 0 0 0 2px var(--imago-border-cyan-active, rgba(0, 224, 255, 0.4));
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`
