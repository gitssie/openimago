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
//   .effect[data-selected]  thin 1px SOLID cyan border, NO halo (approved minimal
//                           direction, docs/images/cut_panel.png — was a 2px ring
//                           + inset ring + 18px cyan glow, too loud for the flat look)
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

  /* Selected: thin 1px SOLID cyan border, NO halo (approved minimal direction). */
  .effect[data-selected]::after {
    content: '';
    position: absolute;
    inset: 0;
    outline: 1px solid var(--imago-neon-cyan, #00f0ff);
    outline-offset: -1px;
    border-radius: var(--imago-radius-md, 5px);
    pointer-events: none;
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

  /* ── Clean clips: NO grab/trim grip (openimago-q4cf) ──────────────────────────
     Upstream draws a grey "||" handle (an 18px white box with two #333 .line bars)
     on each clip edge when it is [data-selected] (effects/parts/styles.js). The
     approved reference (docs/images/cut_panel.png) shows CLEAN clips — both the
     filmstrip clips and the green BGM bar have NO grip chrome. Hide the handles on
     every effect; trimming still works by dragging the clip edge, and our edit
     pipeline derives trim from the effect-state diff (cut-effect-diff.ts), NOT
     from these handle nodes, so nothing functional is lost. Higher specificity +
     later position than upstream's "&[data-selected] .trim-handle-*" wins. */
  .effect .trim-handle-left,
  .effect .trim-handle-right,
  .effect[data-selected] .trim-handle-left,
  .effect[data-selected] .trim-handle-right {
    display: none;
  }

  /* ── BGM lane stays flat (openimago-q4cf): kill the teal line under the bar ────
     The BGM clip's visible green bar is SHORTER (26px) than its 50px effect box
     and centered, so the full-box cyan affordances (the [data-selected]::after
     outline and the :hover cyan outline) draw a line ~12px BELOW the green bar —
     reading as a bright teal horizontal rule under it, which is NOT in the design
     (flat black there). Scope those affordances OFF for the BGM effect only
     (matched by the ".bgm-bar" content the waveform patch mounts). Selection cyan
     stays on VIDEO clips — the constraint keeps cyan on the selected clip + the
     active play affordance; the BGM bar simply reads as a clean flat green block. */
  .effect:has(.bgm-bar)::after {
    display: none;
  }

  .effect:has(.bgm-bar):hover {
    outline: none;
  }

  /* Selected BGM stays flat (openimago-g1hb): never wash the green out with 1.1.3's
     selected brightness filter, and put the crisp 1px cyan selection border ON the bar
     (matching the clip selection language) rather than an oversized box. NOTE: for the
     VENDORED editor the live equivalent lives in upstream effects/parts/styles.ts keyed
     on [data-audio] (this patch only fires for the npm-omniclip importer). */
  .effect:has(.bgm-bar)[data-selected] {
    filter: none;
  }
  .effect:has(.bgm-bar)[data-selected] .bgm-bar {
    outline: 1px solid var(--imago-neon-cyan, #00f0ff);
    outline-offset: -1px;
  }
`

// Single combined export (the consumer wraps THIS in its own use.styles array
// slot). Upstream first, overrides last → imago cascade wins.
export const styles = css`
  ${upstreamStyles}
  ${imagoOverrides}
`
