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
import { spriteBackgroundSizeX } from './filmstrip-sprite-css'

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

  // ── Static sprite filmstrip — one cell per second, each showing the FIRST frame ──
  // (openimago-ugli) The strip is just a "which video is this" marker, so every
  // cell shows the video's FIRST frame — no time→frame mapping (the old px5g
  // per-second source-frame mapping is gone). One cell per second of the clip's
  // length lets the user gauge duration; the repeated first frame identifies the
  // source. Static CSS background; no decode/seek.
  //
  //   - cellCount = ceil(clip duration) — one cell per second of the trimmed clip.
  //   - every cell shows frame 0, cropped to fill the cell by PERCENTAGE
  //     (background-size-x = frameCount*100%, background-position-x = 0 —
  //     filmstrip-sprite-css), so exactly one frame shows per cell regardless of
  //     the cell's pixel width (a flex cell is far wider than the 28px frame).
  // Cell width is the effect's REAL rendered width / cellCount, via CSS
  // (`.filmstrip` width:100%, each cell `flex:1 1 0`) — no 2^zoom guesswork.
  const render_filmstrip = () => {
    const get_effect = use.context.state.effects.find((e) => e.id === effect.id) ?? effect

    const spriteUrl = get_effect.filmstrip_url
    const frameCount = get_effect.filmstrip_frame_count
    // No sprite (orphan / pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // GUARD: typeof NaN === 'number', so use Number.isFinite (a NaN duration would
    // make ceil(NaN)=NaN, max(1,NaN)=NaN → 0 cells → an empty clip).
    const fineNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

    // TRIMMED clip duration drives cell count only. Fallbacks all finite>0 so a
    // sprited clip is never empty.
    const clipDurationSeconds =
      fineNum(get_effect.filmstrip_duration_seconds) || fineNum(get_effect.duration / 1000) || 1

    const cellCount = Math.max(1, Math.min(MAX_CELLS, Math.ceil(clipDurationSeconds)))

    // PERCENTAGE crop so exactly ONE frame (the first) fills each cell regardless
    // of the cell's pixel width (openimago-ugli). background-size-x =
    // frameCount*100% (each frame == one cell width); background-position-x = 0
    // (always frame 0).
    const bgSizeX = spriteBackgroundSizeX(frameCount)
    const cells = []
    for (let i = 0; i < cellCount; i++) {
      cells.push(html`
        <div
          class="sprite-cell"
          style="
            height: ${CELL_H}px;
            background-image: url('${spriteUrl}');
            background-repeat: no-repeat;
            background-size: ${bgSizeX} ${CELL_H}px;
            background-position: 0 0;
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
      /* Each cell splits the effect's REAL rendered width equally → one second
         per cell at the true on-screen scale (no 2^zoom guesswork). min-width:0
         lets flex shrink them below content size for short clips. */
      .sprite-cell {
        flex: 1 1 0;
        min-width: 0;
        image-rendering: auto;
      }
    `,
  ])}`
})
