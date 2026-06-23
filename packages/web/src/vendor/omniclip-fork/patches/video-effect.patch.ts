// PATCH — static sprite-sheet filmstrip (openimago-78m9).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/effects/video-effect.js  → VideoEffect view
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipVideoEffectPatch), guarding the relative `./video-effect.js` import
// from omni-timeline's effects index.
//
// WHY: omniclip's timeline filmstrip extracted frames CLIENT-SIDE at render time
// (seek the <video> per cell → drawImage → toDataURL). That is the root cause of
// the lag, flicker, white frames, and appear/disappear-on-scroll. Industry
// editors (Canva etc.) instead PRECOMPUTE a sprite sheet (one horizontal strip of
// N small frames) and render it statically via CSS background-position — instant,
// smooth, no decode. We switch to that.
//
// This view:
//   - drops the WebCodecs Filmstrip entirely (no new Filmstrip(), no seek/draw,
//     no requestVideoFrameCallback, no scroll/zoom recalc),
//   - renders the filmstrip as a row of fixed-width 9:16 cells; each cell shows
//     one sprite frame via background-image + background-position (the sprite +
//     its dims are carried on the effect as filmstrip_url / filmstrip_frame_count
//     / filmstrip_frame_w / filmstrip_frame_h, threaded by hydrate-from-cut),
//   - KEEPS the on_media_change("added") → compositor.recreate composition (the
//     preview PLAYER still uses WebCodecs for playback — only the timeline strip
//     changed).
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { html, css } from '@benev/slate'
import { Effect } from 'omniclip/x/components/omni-timeline/views/effects/parts/effect.js'
import { shadow_view } from 'omniclip/x/context/context.js'
import { calculate_effect_width } from 'omniclip/x/components/omni-timeline/utils/calculate_effect_width.js'

// 9:16 portrait cell, full lane height (omniclip lanes are 50px). 28/50 ≈ 0.56.
const CELL_W = 28
const CELL_H = 50
// Bound the DOM cell count for very long/zoomed clips (each cell is a cheap div).
const MAX_CELLS = 800

export const VideoEffect = shadow_view((use) => (effect, timeline) => {
  const media = use.context.controllers.media
  const compositor = use.context.controllers.compositor

  // Compose the clip into the WebCodecs preview compositor when its media lands.
  // (Same trigger as upstream; the filmstrip recalc that used to follow is gone.)
  use.mount(() => {
    const dispose = media.on_media_change(({ files, action }) => {
      if (action !== 'added') return
      for (const { hash } of files) {
        const already = compositor.managers.videoManager.get(effect.id)
        if (hash === effect.file_hash && !already) {
          compositor.recreate([effect], media)
        }
      }
    })
    return () => dispose()
  })

  // ── Static sprite filmstrip ──────────────────────────────────────────────
  const render_filmstrip = () => {
    const get_effect = use.context.state.effects.find((e) => e.id === effect.id) ?? effect
    const zoom = use.context.state.zoom
    const clipWidth = calculate_effect_width(get_effect, zoom)

    const spriteUrl = get_effect.filmstrip_url
    const frameCount = get_effect.filmstrip_frame_count
    // No sprite (e.g. orphan or pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1 || clipWidth <= 0) {
      return html`<div class="filmstrip"></div>`
    }

    const cellCount = Math.max(1, Math.min(MAX_CELLS, Math.ceil(clipWidth / CELL_W)))
    // The sprite is one horizontal strip of `frameCount` frames. Scale it so each
    // frame is CELL_W wide when used as a background; pick the frame nearest each
    // cell's proportional position and offset background-position-x to it.
    const stripPxW = frameCount * CELL_W
    const cells = []
    for (let i = 0; i < cellCount; i++) {
      const t = cellCount === 1 ? 0 : i / (cellCount - 1)
      const frameIdx = Math.min(frameCount - 1, Math.round(t * (frameCount - 1)))
      cells.push(html`
        <div
          class="sprite-cell"
          style="
            width: ${CELL_W}px;
            height: ${CELL_H}px;
            background-image: url('${spriteUrl}');
            background-repeat: no-repeat;
            background-size: ${stripPxW}px ${CELL_H}px;
            background-position: ${-(frameIdx * CELL_W)}px 0;
          "
        ></div>
      `)
    }
    return html`<div class="filmstrip">${cells}</div>`
  }

  return html`${Effect([
    timeline,
    effect,
    html`${render_filmstrip()}`,
    css`
      .content {
        width: 100%;
      }
      .filmstrip {
        height: ${CELL_H}px;
        display: flex;
        flex-wrap: nowrap;
        overflow: hidden;
        width: 100%;
        pointer-events: none;
      }
      .sprite-cell {
        flex: 0 0 auto;
        image-rendering: auto;
      }
    `,
  ])}`
})
