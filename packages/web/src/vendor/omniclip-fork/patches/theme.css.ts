// PATCH — omniclip theming hooks (openimago-uyd0, spike point 5).
//
// Replaces the hard-coded colors in these omniclip@1.0.7 sources with
// `--omni-*` CSS custom properties (which inherit THROUGH the shadow boundary)
// and adds `part="..."` on the clip element so the host can also reach in via
// ::part(). The host maps --imago-* -> --omni-* via IMAGO_TO_OMNI_THEME
// (fork-contract.ts) on an ancestor element.
//
//   s/components/omni-timeline/styles.ts                 — editor background
//   s/components/omni-timeline/views/effects/parts/styles.ts — clip fill/border/orphan
//
// Original clip styles used: background:#201f1f; orphan border:3px dotted red;
// trim handles background:white / .line #333. Those literals become var(--omni-*)
// with the SAME values as fallbacks so an un-themed mount looks identical.
//
// BROWSER-ONLY (imports @benev/slate `css`).

import { css } from '@benev/slate'
import { OMNI_THEME_VARS, ORPHAN_CLIP_ATTRIBUTE } from 'src/_spike/omniclip/fork-contract'

// Patched replacement for omni-timeline/styles.ts `styles`.
export const timeline_styles = css`
  :host {
    display: flex;
    overflow: scroll;
    position: relative;
    background: var(${OMNI_THEME_VARS.background}, transparent);
    color: var(${OMNI_THEME_VARS.text}, inherit);
  }
`

// Patched replacement for effects/parts/styles.ts `.effect` block (excerpt —
// the rest of the original rules are kept verbatim in the real fork).
export const effect_styles = css`
  .effect {
    display: flex;
    align-items: center;
    background: var(${OMNI_THEME_VARS.clipFill}, #201f1f);
    border: 1px solid var(${OMNI_THEME_VARS.clipBorder}, transparent);
    border-radius: 5px;
    cursor: pointer;
    position: absolute;
    top: 0;
    height: 50px;
    overflow: hidden;
  }

  /* Reuse omniclip's existing orphan state for "missing source" placeholders. */
  .effect[${ORPHAN_CLIP_ATTRIBUTE}] {
    border: 3px dotted var(${OMNI_THEME_VARS.orphan}, red);
    color: var(${OMNI_THEME_VARS.orphan}, red);
  }

  .effect[data-selected] .trim-handle-left,
  .effect[data-selected] .trim-handle-right {
    background: var(${OMNI_THEME_VARS.accent}, white);
  }
`
