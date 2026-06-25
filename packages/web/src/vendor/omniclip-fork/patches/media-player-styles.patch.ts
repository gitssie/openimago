// PATCH — portrait 9:16 preview player instead of omniclip's hardcoded 16:9
// (openimago-vm5v).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/media-player/styles.js  → export `styles`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipMediaPlayerStylesPatch). The media-player view does `use.styles(styles)`,
// injecting this into the player's shadow root.
//
// omniclip hardcodes `aspect-ratio: 16/9` on `figure` and `.canvas-container`,
// so a portrait 9:16 project (1080×1920 — set at boot in index.ts) renders
// letterboxed in a landscape box, exposing the dark `.lower-canvas`. We RE-EXPORT
// omniclip's own `styles` unchanged, then APPEND a 9:16 override so the later
// equal-specificity rules win; the fabric canvas (already `width/height:100%
// !important` upstream) then scales to the portrait box, centered in the panel.
// Importing the upstream module from HERE does NOT loop: the resolveId guard only
// redirects imports whose importer is inside omniclip; this file lives in src/.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/views/media-player/styles.js'

// PORTRAIT override (16:9 → 9:16). The figure/.canvas-container drive the box the
// canvas fills; min-height:0 lets the figure shrink within the pane so the 9:16
// box is bounded by the available height and stays centered (the .flex parent is
// already justify/align center). The surrounding dark area is acceptable (= #19).
//
// COMBINED-BAR override (openimago-4qwj): the playback transport (play/pause +
// fullscreen) now lives in the single combined control bar (toolbar.patch.ts), so
// the player's own in-figure `.controls` overlay would DUPLICATE it. Hide that
// overlay here. We keep upstream's `.controls[data-state]` rules intact above; a
// blanket `.controls { display:none }` (last → wins the equal-specificity cascade)
// removes the floating play/fullscreen buttons drawn over the preview canvas.
const imagoOverrides = css`
  figure {
    aspect-ratio: 9/16;
    min-height: 0;
    max-height: 100%;
    max-width: 100%;
    /* The player's .flex parent is column flex; the default align-self:stretch
       blows figure to the full panel width (~733px), and aspect-ratio can't
       constrain the stretched axis — so its width no longer follows 9/16 and the
       9:16 .canvas-container sits centered with wide dark side-gaps that read as a
       second canvas (openimago-axrz). Centering stops the stretch → width is
       derived from height × 9/16 = the canvas width, gaps gone. */
    align-self: center;
    /* Trim upstream's 1em figure margin (openimago-ypxq): since the preview is
       bound by the leaf HEIGHT, ~32px of vertical margin shrank the 9:16 width. A
       small symmetric margin reclaims that height so the preview reads larger,
       paired with the raised PLAYER_PANE_PERCENT in index.ts. */
    margin: 4px auto;
  }
  .canvas-container {
    aspect-ratio: 9/16;
  }
  /* Transport moved to the combined control bar (openimago-4qwj) — hide the
     in-figure overlay so play/fullscreen are not rendered twice. */
  #video-controls.controls,
  .controls {
    display: none !important;
  }
`

// Single combined export (the consumer passes THIS to use.styles). Upstream
// first, overrides last → the portrait aspect wins the cascade.
export const styles = css`
  ${upstreamStyles}
  ${imagoOverrides}
`
