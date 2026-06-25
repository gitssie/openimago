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
// BROWSER-ONLY (imports @benev/slate \`css\`).

import { css } from '@benev/slate'

export const combinedToolbarStyles = css`
  :host {
    display: flex;
    min-height: 46px;
    --transition: 0.2s;
    /* CURRENT timecode reads as bright neutral off-white — the UPDATED reference
       (docs/images/cut_panel.png) shows it brighter than the muted-grey total,
       NOT the amber the earlier cut_panel_v2 pass used. Scoped to this bar via a
       token (no global token is the right semantic) so a future re-tint is local. */
    --cut-time-current: var(--imago-text-primary, #e8e8ec);
  }

  .toolbar {
    display: flex;
    align-items: center;
    box-sizing: border-box;
  }

  /* One bar: left | center | right, pinned to the visible viewport (the timeline
     scroll-content is ~3000px wide, so width comes from the inline offsetWidth px,
     and sticky+left:0 keeps the bar at the visible left as the timeline scrolls). */
  .tools {
    position: sticky;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    max-width: 100%;
    gap: 0.75em;
    padding: 6px 12px;
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

  /* ── RIGHT: fullscreen + zoom ── */
  .right {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 0.1em;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`
