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
const imagoOverrides = css`
  figure {
    aspect-ratio: 9/16;
    min-height: 0;
    max-height: 100%;
    max-width: 100%;
  }
  .canvas-container {
    aspect-ratio: 9/16;
  }
`

// Single combined export (the consumer passes THIS to use.styles). Upstream
// first, overrides last → the portrait aspect wins the cascade.
export const styles = css`
  ${upstreamStyles}
  ${imagoOverrides}
`
