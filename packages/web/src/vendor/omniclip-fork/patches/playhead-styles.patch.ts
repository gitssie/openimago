// PATCH — white timeline playhead instead of omniclip's hardcoded yellow
// (openimago-h9pt).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/playhead/styles.js  → export `styles`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipPlayheadStylesPatch). The playhead view does `use.styles(styles)`,
// injecting this into the playhead's shadow root.
//
// omniclip hardcodes `background: yellow` on `.playhead` and `color: yellow` on
// the `.head` arrow handle as CSS LITERALS (not var(--omni-*)), so our theme
// variables cannot reach them. We RE-EXPORT omniclip's own `styles` unchanged,
// then APPEND a color-only override so the later equal-specificity rules win —
// the vertical line + arrow structure/size are left exactly as upstream; only
// the color changes yellow → white. Importing the upstream module from HERE does
// NOT loop: the resolveId guard only redirects imports whose importer is inside
// omniclip; this file lives in src/, so its import resolves to the real upstream.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/views/playhead/styles.js'

// COLOR-ONLY overrides (yellow → white). Width/height/arrow geometry untouched.
const imagoOverrides = css`
  .playhead {
    background: var(--imago-text-primary, #fff);
  }
  .playhead .head {
    color: var(--imago-text-primary, #fff);
  }
`

// Single combined export (the consumer passes THIS to use.styles). Upstream
// first, overrides last → the imago color wins the cascade.
export const styles = css`
  ${upstreamStyles}
  ${imagoOverrides}
`
