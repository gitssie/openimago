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

  // ── Static sprite filmstrip — one REAL frame per second, offset by inPoint ──
  // (openimago-px5g) Each clip shows one cell per second of its TRIMMED length,
  // and each cell shows the REAL source frame at that cell's ABSOLUTE source time
  // — so a clip's strip is a moving window over the video, and after a split the
  // 前 half [inPoint..t] and 后 half [t..outPoint] show visually distinct,
  // frame-accurate ranges (the old first-frame-only render made both halves look
  // identical). Static CSS background-position; no decode/seek.
  //
  // Mapping (the sprite is ONE horizontal strip of `frameCount` frames spanning
  // the FULL SOURCE video):
  //   - inPoint seconds = effect.start / 1000 (hydrate sets start = inPoint*1000).
  //   - cellCount = ceil(clip duration) — one cell per second of the trimmed clip.
  //   - secondsPerCell = clipDuration / cellCount (≈1s; exact so the last cell
  //     lands on outPoint).
  //   - cell i absolute source time t = inPoint + i*secondsPerCell.
  //   - frameIndex = clamp(round(t / SOURCE duration * (frameCount-1)), 0, N-1).
  //     SOURCE duration (filmstrip_source_duration_seconds = result.duration) is
  //     REQUIRED here — the sprite spans the source, NOT the trimmed clip.
  //   - background-position-x = -(frameIndex * FRAME_W).
  // Cell width is still the effect's REAL rendered width / cellCount, via CSS
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

    // TRIMMED clip duration (cell count / width). Fallbacks all finite>0 so a
    // sprited clip is never empty.
    const clipDurationSeconds =
      fineNum(get_effect.filmstrip_duration_seconds) || fineNum(get_effect.duration / 1000) || 1

    // SOURCE video duration (frame-index mapping basis — the sprite spans the
    // whole source). Fall back to the clip duration when absent (then the strip
    // still moves across the clip, just mapped to its own length).
    const sourceDurationSeconds =
      fineNum(get_effect.filmstrip_source_duration_seconds) || clipDurationSeconds

    // inPoint in seconds (effect.start is inPoint*1000; 0 when untrimmed/missing).
    const inPointSeconds = fineNum(get_effect.start / 1000) || 0

    const cellCount = Math.max(1, Math.min(MAX_CELLS, Math.ceil(clipDurationSeconds)))
    const secondsPerCell = clipDurationSeconds / cellCount

    // Sprite NATURAL size → each shown frame is a crisp 9:16 FRAME_W×FRAME_H.
    const stripPxW = frameCount * FRAME_W
    const lastFrame = frameCount - 1
    const cells = []
    for (let i = 0; i < cellCount; i++) {
      // Absolute source time at this cell, mapped to a sprite frame index.
      const t = inPointSeconds + i * secondsPerCell
      const ratio = sourceDurationSeconds > 0 ? t / sourceDurationSeconds : 0
      const frameIdx = Math.max(0, Math.min(lastFrame, Math.round(ratio * lastFrame)))
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
