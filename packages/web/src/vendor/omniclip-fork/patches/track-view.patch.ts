// PATCH — left TRACK-HEADER GUTTER (per-track icon column) (openimago-8qmq;
// reworked from sticky overlay → REAL reserved gutter in openimago-scml).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/track/view.js  → export `Track`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipTrackViewPatch), guarding the relative `./views/track/view.js`
// import from omni-timeline's component.js.
//
// WHY: the approved reference (docs/images/cut_panel.png + the user's high-res
// shot) shows each timeline TRACK with a narrow icon column on its far LEFT —
// the video/filmstrip track has a clip icon + speaker, the BGM track a music
// note + speaker, an empty audio track a waveform icon. Upstream renders each
// track as a bare `<div class=track style=height:50px>`, so the filmstrip starts
// flush at x=0 and there is no gutter. This patch adds that gutter.
//
// REAL RESERVED GUTTER, NOT AN OVERLAY (openimago-scml): the original version made
// the chip a `z-index:5` sticky chip that PAINTED OVER the first ~72px of every
// clip. Now the clip area is genuinely shifted right to make room: a SIBLING
// styles patch (omni-timeline-styles.patch.ts) left-pads the `.timeline` flex
// column by GUTTER_PX, which moves `.timeline-relative` (and its absolute effects
// + the drag bounds, in lockstep) AND the time-ruler + toolbar all right by the
// same GUTTER_PX. That parent-padding shift is coordinate-math SAFE (it does NOT
// introduce an offset between the drag bounds.left and the effects' x=0 — see that
// file's header for the proof).
//
// This file then PINS the header chip into the opened 0..GUTTER_PX band so it sits
// in the gutter at every scroll position, never over a clip:
//   `position: sticky; left: 0; margin-left: -GUTTER_PX`
// The chip is the first child of its `.track` row (whose content now starts at
// GUTTER_PX). `margin-left: -GUTTER_PX` pulls the chip's static position back to
// scroll-content x=0 (the gutter's left edge); `position: sticky; left: 0` keeps it
// pinned to the visible left edge as the timeline scrolls horizontally (its scroll
// container is the omni-timeline :host overflow:scroll). Because the chip lives in
// its OWN `.track` row, it is naturally Y-aligned to that track — no detached
// fixed column / Y-sync needed. The track div keeps its 50px height; the chip is
// centered within it. The chip width is GUTTER_PX so it exactly fills the gutter,
// clips start flush at its right edge — nothing overlaps.
//
// KIND → ICONS (derived from the effects already on this track via
// `controller.get_effects_on_track(state, index)`):
//   any video|image effect → VIDEO header  (clip icon + speaker)
//   any audio effect        → BGM header    (music note + speaker)
//   no effects              → EMPTY header  (waveform icon)
// The speaker is a STATIC indicator: omniclip exposes no per-track mute, so we do
// NOT wire a toggle that would error — it only matches the design's quiet look.
//
// FLAT BLACK look: icons are muted (var(--imago-text-muted/faint), inherited
// through the shadow boundary). NO cyan here — cyan is reserved for the active
// play affordance + the selected clip.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint). Re-imports the
// upstream Track deps from src/ — the resolveId guard only redirects importers
// INSIDE the omniclip package, so these resolve to real upstream (no loop).

import { html, css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/views/track/styles.js'
import { shadow_view } from 'omniclip/x/context/context.js'
import { AddTrackIndicator } from 'omniclip/x/components/omni-timeline/views/indicators/add-track-indicator.js'
import { GUTTER_PX } from './timeline-gutter'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEffect = any

type TrackKind = 'video' | 'bgm' | 'empty'

/** Derive the header kind from the effects already laid on this track. */
function trackKind(effects: AnyEffect[]): TrackKind {
  if (effects.some((e) => e.kind === 'video' || e.kind === 'image')) return 'video'
  if (effects.some((e) => e.kind === 'audio')) return 'bgm'
  return 'empty'
}

// ── Inline SVGs (shadow DOM can't use the Vue OiIcon). Flat, single-path, 18px,
//    currentColor so they inherit the muted gutter text color. ──────────────────

/** Film/clip strip — the video track. */
const clipIcon = html`
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18M3 15h18M8 5v14M16 5v14" />
  </svg>
`

/** Music note — the BGM track. */
const musicIcon = html`
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="16" cy="16" r="2.4" />
  </svg>
`

/** Waveform — the empty/audio track. */
const waveIcon = html`
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 12h2M9 7v10M14 4v16M19 9v6" />
  </svg>
`

/** Speaker (static indicator — omniclip has no per-track mute). */
const speakerIcon = html`
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
       stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 9v6h3l4 4V5L8 9H5z" />
    <path d="M16 9a3 3 0 0 1 0 6" />
  </svg>
`

function headerIcons(kind: TrackKind) {
  if (kind === 'video') return html`${clipIcon}<span class="track-header__sub">${speakerIcon}</span>`
  if (kind === 'bgm') return html`${musicIcon}<span class="track-header__sub">${speakerIcon}</span>`
  return html`${waveIcon}`
}

function headerLabel(kind: TrackKind): string {
  if (kind === 'video') return '视频轨道'
  if (kind === 'bgm') return '背景音乐轨道'
  return '音频轨道'
}

// ── Gutter styles appended AFTER upstream so the cascade applies them last. The
//    chip occupies the REAL reserved gutter that omni-timeline-styles.patch.ts
//    opened (left-padding `.timeline` by GUTTER_PX). ────────────────────────────
const gutterStyles = css`
  /* The chip is the first child of the 50px .track row. The sibling styles patch
     shifted the whole clip area right by GUTTER_PX (parent padding on .timeline),
     so the .track row's content now starts at GUTTER_PX. \`margin-left: -GUTTER_PX\`
     pulls the chip's static position back to scroll-content x=0 (the gutter's left
     edge); \`position: sticky; left: 0\` pins it to the visible left edge during
     horizontal scroll (its scroll container is the omni-timeline :host
     overflow:scroll). It therefore sits in the 0..GUTTER_PX gutter at every scroll
     position — to the LEFT of the clips (which start at GUTTER_PX), never over
     them. z-index:2 keeps it above the lane background without needing to paint
     over clips (it no longer overlaps any). Tokens inherit through the shadow
     boundary (applyImagoTheme). */
  .track-header {
    position: sticky;
    left: 0;
    margin-left: -${GUTTER_PX}px;
    z-index: 2;
    flex: 0 0 auto;
    box-sizing: border-box;
    width: ${GUTTER_PX}px;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    /* Flat dark gutter matching the lane; subtle right hairline separates it from
       the clips. */
    background: var(--imago-bg-deep, #0a0a0f);
    border-right: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.06));
    color: var(--imago-text-muted, #989898);
  }

  .track-header__sub {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--imago-text-faint, #6a6a6a);
  }

  .track-header svg {
    display: block;
  }
`

export const Track = shadow_view((use) => (index: number) => {
  use.styles([upstreamStyles, gutterStyles])
  const controller = use.context.controllers.timeline
  const track_effects: AnyEffect[] = controller.get_effects_on_track(use.context.state, index)

  // Preserve upstream's text-only-track shorter height behaviour exactly.
  const if_text_on_track_styles = () =>
    track_effects.some((e) => e.kind === 'text') && !track_effects.some((e) => e.kind !== 'text')
      ? 'height: 30px;'
      : 'height: 50px;'

  const kind = trackKind(track_effects)

  return html`
    <div style="${if_text_on_track_styles()}" class="track">
      <div class="track-header" role="presentation" aria-label="${headerLabel(kind)}" data-kind="${kind}">
        ${headerIcons(kind)}
      </div>
    </div>
    <div class="indicators">
      ${AddTrackIndicator()}
    </div>
  `
})
