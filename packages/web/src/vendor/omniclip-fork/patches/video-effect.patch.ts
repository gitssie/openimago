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
  filmstripCellCount,
  FILMSTRIP_TILE_W,
} from './filmstrip-sprite-css'

// Cell height = full omniclip lane height (lanes are 50px). The sprite frames are
// 9:16 portrait, 28×50 (matching result.filmstrip.frameW/H). Each cell spans ONE
// second of the clip (`flex: 1 1 0`, so the N = ceil(durationSeconds) cells split
// the effect's real rendered width equally — no 2^zoom guesswork) and holds a
// FIXED 28×50 thumbnail box left-aligned at the second's start (openimago-7vrd).
const CELL_H = 50
// Bound the DOM cell count for very long clips (each cell is a cheap div).
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

  // ── Static sprite filmstrip — ONE 9:16 FIRST-frame thumbnail per second ──
  // (openimago-7vrd) The strip is a "which video is this" marker: exactly one
  // thumbnail of the video's FIRST frame per second of the clip, shown at NATIVE
  // 9:16 aspect (no time→frame mapping). Each cell spans one second (flex:1 1 0,
  // so the cells split the effect's real width at the true on-screen scale) and
  // holds a FIXED 28×50 thumbnail box left-aligned at the second's start. The box
  // is NOT stretched to fill the wider cell — that distorted the portrait frame
  // into a horizontal bar (openimago-ugli/u3qq). The lane background shows between
  // thumbnails by design. The top SECONDS come from omniclip's own TimeRuler (same
  // 2^zoom scale + scroll origin) — we add NO per-cell labels. Static CSS
  // background; no decode/seek.
  //
  //   - cellCount = ceil(clip duration) — one thumbnail per second (≥1, clamped).
  //   - each box shows frame 0, cropped to fill the FIXED 28px box by PERCENTAGE
  //     (background-size-x = frameCount*100%, background-position-x = 0 —
  //     filmstrip-sprite-css). Box is 9:16 and the frame is 9:16 → no distortion.
  const render_filmstrip = () => {
    const get_effect = use.context.state.effects.find((e) => e.id === effect.id) ?? effect

    const spriteUrl = get_effect.filmstrip_url
    const frameCount = get_effect.filmstrip_frame_count
    // No sprite (orphan / pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // GUARD: typeof NaN === 'number', so use Number.isFinite (a NaN duration would
    // make ceil(NaN)=NaN → 0 cells → an empty clip).
    const fineNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

    // TRIMMED clip duration → one cell per second. Fallbacks all finite>0 so a
    // sprited clip is never empty (clip<1s still shows ≥1 thumbnail).
    const clipDurationSeconds =
      fineNum(get_effect.filmstrip_duration_seconds) || fineNum(get_effect.duration / 1000) || 1

    const cellCount = filmstripCellCount(clipDurationSeconds, MAX_CELLS)
    if (cellCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // PERCENTAGE crop so the FIRST frame fills the FIXED 28px box (background-size-x
    // = frameCount*100%, background-position-x = 0). Box and frame are both 9:16.
    const bgSizeX = spriteBackgroundSizeX(frameCount)
    const cells = []
    for (let i = 0; i < cellCount; i++) {
      cells.push(html`
        <div class="sprite-cell">
          <div
            class="sprite-thumb"
            style="
              width: ${FILMSTRIP_TILE_W}px;
              height: ${CELL_H}px;
              background-image: url('${spriteUrl}');
              background-repeat: no-repeat;
              background-size: ${bgSizeX} ${CELL_H}px;
              background-position: 0 0;
            "
          ></div>
        </div>
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
      /* Each cell spans ONE second of the clip (openimago-7vrd): flex:1 1 0 so
         the N cells split the effect's real rendered width equally → one cell
         per second at the true on-screen scale (no 2^zoom guesswork). min-width:0
         lets flex shrink them for short clips. */
      .sprite-cell {
        flex: 1 1 0;
        min-width: 0;
      }
      /* The thumbnail box is a FIXED 9:16 28×CELL_H, left-aligned at the
         second's start; the rest of the (wider) cell shows the lane background.
         Fixing the box keeps the portrait first frame at native aspect — NOT
         stretched to fill the cell (the openimago-ugli/u3qq distortion). */
      .sprite-thumb {
        image-rendering: auto;
      }
    `,
  ])}`
})
