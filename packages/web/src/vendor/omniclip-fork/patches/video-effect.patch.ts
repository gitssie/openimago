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
import {
  spriteBackgroundSizeX,
  effectWidthPx,
  filmstripTileCount,
  FILMSTRIP_TILE_W,
} from './filmstrip-sprite-css'

// Cell height = full omniclip lane height (lanes are 50px; the sprite frames are
// 9:16 portrait, 28×50, matching result.filmstrip.frameW/H). Cell WIDTH is NOT a
// constant: each cell is `flex: 1 1 0`, so the N (= ceil(durationSeconds)) cells
// split the effect's real rendered width equally (openimago-78m9). The single
// frame shown per cell is cropped by PERCENTAGE (filmstrip-sprite-css) so it
// fills the cell whatever its pixel width (openimago-ugli).
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

  // ── Static sprite filmstrip — fixed-width 9:16 FIRST-frame tiles, tiled across ──
  // (openimago-u3qq) The strip is just a "which video is this" marker: every tile
  // shows the video's FIRST frame at NATIVE 9:16 aspect (no time→frame mapping).
  // Earlier we stretched one frame across a wide `flex:1` cell, which distorted
  // the portrait frame into a horizontal bar; instead we lay down FIXED 28×50
  // (9:16) tiles and clip the overflow, so the frame never stretches and the lane
  // is seamlessly filled. The top SECONDS come from omniclip's own TimeRuler (same
  // 2^zoom scale + scroll origin) — we add NO per-cell labels. Static CSS
  // background; no decode/seek.
  //
  //   - tileWidth = FILMSTRIP_TILE_W (28px = 50*9/16) — native portrait aspect.
  //   - tileCount = ceil(effectWidthPx / tileWidth), clamped to MAX_CELLS; the
  //     lane (`overflow:hidden`) clips the trailing overflow tile.
  //   - effectWidthPx = (end - start) * 2^zoom — the upstream calculate_effect_width
  //     formula. Read state.zoom directly; NEVER subscribe the editor here.
  //   - every tile shows frame 0, cropped to fill the tile by PERCENTAGE
  //     (background-size-x = frameCount*100%, background-position-x = 0 —
  //     filmstrip-sprite-css). Tile is 9:16 and the frame is 9:16 → no distortion.
  const render_filmstrip = () => {
    const get_effect = use.context.state.effects.find((e) => e.id === effect.id) ?? effect

    const spriteUrl = get_effect.filmstrip_url
    const frameCount = get_effect.filmstrip_frame_count
    // No sprite (orphan / pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // Effect's real rendered width via the upstream zoom formula, then how many
    // fixed-width tiles cover it. 0 width → empty lane (never NaN tiles).
    const widthPx = effectWidthPx(get_effect.start, get_effect.end, use.context.state.zoom)
    const tileCount = filmstripTileCount(widthPx, FILMSTRIP_TILE_W, MAX_CELLS)
    if (tileCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // PERCENTAGE crop so the FIRST frame fills each fixed tile (background-size-x =
    // frameCount*100%, background-position-x = 0). Tile and frame are both 9:16.
    const bgSizeX = spriteBackgroundSizeX(frameCount)
    const tiles = []
    for (let i = 0; i < tileCount; i++) {
      tiles.push(html`
        <div
          class="sprite-cell"
          style="
            width: ${FILMSTRIP_TILE_W}px;
            height: ${CELL_H}px;
            background-image: url('${spriteUrl}');
            background-repeat: no-repeat;
            background-size: ${bgSizeX} ${CELL_H}px;
            background-position: 0 0;
          "
        ></div>
      `)
    }
    return html`<div class="filmstrip">${tiles}</div>`
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
      /* FIXED-width 9:16 tiles (openimago-u3qq): each tile is exactly
         FILMSTRIP_TILE_W×CELL_H so the portrait first frame shows at native
         aspect — NOT stretched across a flex cell. flex:0 0 auto keeps the
         inline width; the lane's overflow:hidden clips the trailing tile. */
      .sprite-cell {
        flex: 0 0 auto;
        image-rendering: auto;
      }
    `,
  ])}`
})
