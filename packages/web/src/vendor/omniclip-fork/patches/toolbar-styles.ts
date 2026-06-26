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
// LAYOUT (openimago-jtub): the toolbar is now a PLAIN, NON-SCROLLING full-width bar
// rendered ABOVE omni-timeline's `.scroll-area` (only the ruler + tracks scroll). It
// no longer shares the clips' scroll/zoom geometry, so ALL the prior pin hacks are
// gone — no sticky, no paneWidth measuring, no margin-left:-GUTTER_PX. The host fills
// the timeline width; the bar simply spreads its three groups with space-between.
//
// BROWSER-ONLY (imports @benev/slate `css`).

import { css } from '@benev/slate'

export const combinedToolbarStyles = css`
  :host {
    display: block;
    width: 100%;
    box-sizing: border-box;
    min-height: 46px;
    background: var(--imago-bg-deep, #0a0a0f);
    --transition: 0.2s;
    /* CURRENT timecode reads as bright neutral off-white — the UPDATED reference
       (docs/images/cut_panel.png) shows it brighter than the muted-grey total,
       NOT the amber the earlier cut_panel_v2 pass used. Scoped to this bar via a
       token (no global token is the right semantic) so a future re-tint is local. */
    --cut-time-current: var(--imago-text-primary, #e8e8ec);
  }

  .toolbar {
    display: block;
    width: 100%;
    box-sizing: border-box;
  }

  /* One full-width bar; three groups spread LEFT (.flex — undo/redo/split) ·
     CENTER (.transport — timecode/play) · RIGHT (.right — mute/fullscreen/zoom). */
  .tools {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    gap: 0.75em;
    padding: 6px 12px;
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

  /* ── CENTER: current-time · play/pause · total-time (00:01 ▶ 01:04). The play
     button is the centered emphasis; the two times sit SYMMETRIC around it via an
     equal gap. ── */
  .transport {
    display: flex;
    align-items: center;
    gap: 0.7em;
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

  /* The two times flank the play button. Tabular-nums so the digits don't shift the
     button off-center as the timecode ticks. Current reads bright neutral off-white,
     total stays muted grey. */
  .transport .current,
  .transport .total {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .transport .current {
    color: var(--cut-time-current, #e8e8ec);
  }

  .transport .total {
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
