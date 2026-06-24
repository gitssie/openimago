// PATCH — imago clip styling inside omniclip's shadow DOM (openimago-fhnz,
// design spec openimago-fwzt point 4).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/effects/parts/styles.js  → export `styles`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipEffectStylesPatch). The clip view does `use.styles([..., styles])`,
// injecting this INTO the effect's shadow root — and var(--imago-*) custom
// properties inherit THROUGH the shadow boundary from the themed ancestor
// (applyImagoTheme sets --imago-* / --omni-*), so the injected CSS can read them
// directly. This is why no `part=` is needed.
//
// We RE-EXPORT omniclip's own `styles` unchanged, then APPEND imago overrides so
// the cascade wins (later rules of equal specificity, or higher specificity,
// override the upstream hardcoded hex). Importing the upstream module from HERE
// does NOT loop: the resolveId guard only redirects imports whose importer is
// inside omniclip; this file lives in src/, so its import resolves to the real
// upstream styles.js.
//
// Overrides (rest of upstream trim/drag/grab rules preserved verbatim upstream):
//   .effect                 background → --imago-bg-surface + 1px --imago-border-soft
//   .effect[data-selected]  cyan ring (--imago-border-cyan-active) + cyan glow
//   .effect[data-no-file]   orphan → --imago-neon-pink (was raw red)
//
// Height stays 50px: omniclip's track placement is hardcoded to 50px lanes
// (calculate_effect_track_placement/_index/_closest: trackHeight=50, y/50), so
// the clip must NOT grow to 56px — the 9:16 sprite cells are 28×50 to fit (see
// video-effect.patch.ts, openimago-78m9). BROWSER-ONLY.

import { css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/views/effects/parts/styles.js'

// Imago overrides — appended AFTER upstream so the cascade applies them last.
const imagoOverrides = css`
  .effect {
    background: var(--imago-bg-surface, #201f1f);
    border: 1px solid var(--imago-border-soft, transparent);
    border-radius: var(--imago-radius-md, 5px);
  }

  /* Selected: cyan ring + soft cyan glow, matching the left-panel active card. */
  .effect[data-selected]::after {
    outline: 2px solid var(--imago-border-cyan-active, #00f0ff);
    outline-offset: -2px;
    border-radius: var(--imago-radius-md, 5px);
    box-shadow:
      inset 0 0 0 1px var(--imago-border-cyan-active, #00f0ff),
      0 0 18px rgba(0, 240, 255, 0.18);
  }

  /* Orphan / missing-source: theme pink instead of raw red. */
  .effect[data-no-file] {
    border: 2px dotted var(--imago-neon-pink, #ff2d95);
    color: var(--imago-neon-pink, #ff2d95);
  }

  /* Hover: subtle imago border instead of gray. */
  .effect:hover {
    outline: 1px solid var(--imago-border-cyan, rgba(0, 240, 255, 0.35));
  }
`

// Single combined export (the consumer wraps THIS in its own use.styles array
// slot). Upstream first, overrides last → imago cascade wins.
export const styles = css`
  ${upstreamStyles}
  ${imagoOverrides}
`
