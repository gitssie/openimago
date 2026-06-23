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

// Sprite frame natural size: 9:16 portrait, full lane height (omniclip lanes are
// 50px). 28/50 ≈ 0.56. FRAME_W/H is the per-frame size baked into the sprite
// sheet (matches result.filmstrip.frameW/H) and drives the background-size of the
// first-frame crop. Cell WIDTH is NOT derived from FRAME_W or zoom — each cell is
// `flex: 1 1 0`, so the N (= ceil(durationSeconds)) cells split the effect's real
// rendered width equally (openimago-78m9).
const FRAME_W = 28
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

  // ── Static sprite filmstrip — one FIRST-FRAME cell per second ─────────────
  // Per the user's request (openimago-78m9): each clip shows its FIRST FRAME,
  // laid out one cell per 1 SECOND of the clip's duration.
  //
  // Two RELIABLE values only (the earlier 2^zoom / omniclip-internal-duration
  // math read wrong across the dep-optimizer boundary → 0.125px cells, 800 cells):
  //   1. cellCount = ceil(durationSeconds) — durationSeconds is the clip's TRUE
  //      length in seconds, threaded from the cut model (outPointSeconds -
  //      inPointSeconds) onto the effect as filmstrip_duration_seconds.
  //   2. cell width = the effect's REAL rendered width / cellCount — achieved
  //      purely in CSS: the .filmstrip is width:100% of the effect, and each cell
  //      is `flex: 1 1 0` so the N cells split that real width equally. No
  //      getBoundingClientRect, no 2^zoom — the browser divides at layout time and
  //      re-divides on zoom/resize for free.
  // Every cell shows frame 0 (background-position 0,0) at the sprite's NATURAL
  // frame size → crisp 9:16. No decode/seek. To switch to "the real frame nearest
  // each second" later, flip ONE_FRAME_PER_SECOND (offset i*FRAME_W).
  const ONE_FRAME_PER_SECOND = false

  const render_filmstrip = () => {
    const get_effect = use.context.state.effects.find((e) => e.id === effect.id) ?? effect

    const spriteUrl = get_effect.filmstrip_url
    const frameCount = get_effect.filmstrip_frame_count
    // No sprite (orphan / pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // TRUE clip duration in seconds. GUARD: typeof NaN === 'number', so a missing
    // in/out point that yields NaN must be caught with Number.isFinite (else
    // ceil(NaN)=NaN, max(1,NaN)=NaN → 0 cells → an EMPTY first clip, the bug).
    // Fallbacks, all finite>0: the effect's own duration (ms→s, set by hydrate
    // from the same in/out points), else 1 — so a sprited clip ALWAYS shows ≥1
    // cell (its first frame), never empty.
    const fineNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
    const durationSeconds =
      fineNum(get_effect.filmstrip_duration_seconds) ||
      fineNum(get_effect.duration / 1000) ||
      1

    // One cell per second of TRUE clip duration (reliable, in seconds).
    const cellCount = Math.max(1, Math.min(MAX_CELLS, Math.ceil(durationSeconds)))

    // Sprite is one horizontal strip of `frameCount` frames at FRAME_W each. Use
    // the NATURAL strip size so each shown frame is a crisp 9:16 FRAME_W×FRAME_H.
    const stripPxW = frameCount * FRAME_W
    const cells = []
    for (let i = 0; i < cellCount; i++) {
      // DEFAULT: first frame for every cell. Optional future mode: the frame
      // nearest second i (clamped to the last frame).
      const frameIdx = ONE_FRAME_PER_SECOND ? Math.min(frameCount - 1, i) : 0
      cells.push(html`
        <div
          class="sprite-cell"
          style="
            height: ${CELL_H}px;
            background-image: url('${spriteUrl}');
            background-repeat: no-repeat;
            background-size: ${stripPxW}px ${CELL_H}px;
            background-position: ${-(frameIdx * FRAME_W)}px 0;
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
