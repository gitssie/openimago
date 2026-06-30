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
// Single-div repeat-x filmstrip (openimago-6aew) needs only the width formula + tile
// size; the per-tile loop (spriteBackgroundSizeX / filmstripTileCount) and the lit
// `guard` memoization (openimago-tatc) are gone — one node has nothing to memoize.
import { effectWidthPx, FILMSTRIP_TILE_W } from './filmstrip-sprite-css'
import { ensureFrame0 } from './filmstrip-frame0'
import { perfWrap } from './perf-diag' // TEMP perf diagnostic (openimago-v2mm)

// openimago-6hmb DIAGNOSTIC (DEV-only, reversible): bisect the drag jank between filmstrip
// PAINT and the WebGL preview canvas. `window.__noFilmstrip = true` renders every video clip
// as a FLAT box (skips the tiled repeat-x bitmap). Read live each render; no behaviour change
// when unset. REMOVE once the culprit is identified.
const __DEV =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true
const __noFilmstrip = (): boolean =>
  __DEV && (window as unknown as { __noFilmstrip?: boolean }).__noFilmstrip === true

// Cell height = full omniclip lane height (lanes are 50px; the sprite frames are
// 9:16 portrait, 28×50, matching result.filmstrip.frameW/H). The first-frame image is
// tiled at a FIXED FILMSTRIP_TILE_W×CELL_H cell via CSS `background-repeat: repeat-x`,
// so density follows the clip width (the strip fills the lane) and the 9:16 frame never
// stretches (openimago-jmcp/6aew).
const CELL_H = 50

export const VideoEffect = shadow_view((use) => (effect, timeline) => {
  const media = use.context.controllers.media
  const compositor = use.context.controllers.compositor

  // NARROW subscription (openimago-2m8d). Slate's `use.watch(collector)` re-renders
  // ONLY when the collector's RETURN VALUE changes by deep-equal (WatchTower.track:
  // it runs the collector on EVERY state dispatch but gates the rerender on
  // `!deep.equal(current, previous)`). The old `() => use.context.state` returned the
  // whole state object, so it re-rendered on EVERY field change — including `timecode`,
  // which ticks every frame during playback — rebuilding up to MAX_CELLS tile <div>s
  // per clip each frame (the perf regression). Instead collect ONLY the fields this
  // view's output depends on: the live effect's trim window + sprite inputs, the zoom
  // (tile density), and effects.length (so a SPLIT's new half + the sibling-fallback
  // availability still trigger a re-render — openimago-8ho9). `timecode`/playhead/
  // selection/scroll are NOT in the key, so they no longer force a filmstrip rebuild.
  //
  // The collector MUST read state FRESH each call (it is invoked on every dispatch and
  // must NOT close over a stale effect), so it re-finds the live effect inside itself
  // rather than over the render-scoped `live` below. NOTE: the inner omniclip Effect
  // view has its OWN `use.watch(() => state)` and re-derives its own live effect for the
  // span width/position/transform, so move/trim/delete snap geometry (uvm4) is
  // unaffected by narrowing THIS outer subscription.
  use.watch(() => {
    const state = use.context.state
    const e = state.effects.find((x) => x.id === effect.id) ?? effect
    return [
      e.start,
      e.end,
      e.file_hash,
      e.filmstrip_url,
      e.filmstrip_frame_count,
      state.zoom,
      state.effects.length,
    ]
  })

  // ONE geometry source for BOTH the span and the filmstrip: the LIVE effect from
  // state (post-split end/start), falling back to the passed arg before it lands in
  // state. Passing this same object to the inner Effect view keeps the rendered span
  // width and the filmstrip tile count in lockstep.
  const live = use.context.state.effects.find((e) => e.id === effect.id) ?? effect

  // Re-render trigger for when the async frame-0 crop lands (openimago-6aew). The
  // single-div filmstrip tiles the sprite's cropped FIRST FRAME, produced once per
  // sprite by an offscreen canvas (filmstrip-frame0.ts). The crop is async (image
  // load); when it resolves we bump this counter so the view re-renders and swaps the
  // transient sprite-repeat fallback for the exact frame. Cached by sprite URL, so this
  // fires at most once per source — never on the drag hot path. (slate's state setter
  // takes a value, not an updater, and always re-renders — so we read the current count
  // and set count+1.)
  const [frame0Tick, setFrame0Tick] = use.state(0)

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

  // ── Static single-div filmstrip — source FIRST frame tiled via repeat-x ──────────
  // (openimago-jmcp first-frame semantic; openimago-6aew single-div perf). The strip is
  // a "which video is this" marker showing the video's FIRST frame at NATIVE 9:16 aspect
  // (no time→frame mapping). ONE <div> sized to the trim window tiles a fixed
  // FILMSTRIP_TILE_W×CELL_H (28×50, 9:16) cell of frame 0 via `background-repeat:
  // repeat-x` — density follows the clip width (repeat fills it), the frame never
  // stretches, and there are NO per-tile child nodes (the ~290-div subtree was the
  // paint/composite hotspot — openimago-6aew). The top SECONDS come from omniclip's own
  // TimeRuler (same 2^zoom scale + scroll origin). Static CSS background; no decode/seek.
  //
  //   - widthPx = (end - start) * 2^zoom — the upstream calculate_effect_width formula.
  //     Read state.zoom directly; NEVER subscribe the editor here.
  //   - the tiled cell is frame 0, cropped ONCE per sprite to a standalone dataURL
  //     (filmstrip-frame0.ts) so repeat-x tiles only that frame, not the whole strip.
  const render_filmstrip = () => {
    // openimago-6hmb DIAGNOSTIC: window.__noFilmstrip → FLAT box, no tiled bitmap painted.
    // The empty .filmstrip is transparent, so the clip shows its flat surface fill. Read
    // live each render (toggle takes effect on the next re-render of this clip — see the
    // console instructions; nudge zoom to re-render all clips at once).
    if (__noFilmstrip()) {
      return html`<div class="filmstrip"></div>`
    }
    // The filmstrip sprite is a property of the SOURCE media (file_hash), not of the
    // individual clip segment. A native omniclip SPLIT creates the new half and may
    // not carry our custom top-level filmstrip_* fields onto it (openimago-8ho9), so
    // the selected new half rendered empty. Resolve the sprite from `live`, but if
    // it's missing, fall back to ANY effect in state with the SAME file_hash that DOES
    // have a sprite (the original half) — both halves share the same first-frame
    // sprite. (Persistence is unaffected: cut.json keys filmstrip by sourceShotId and
    // the resolver re-derives it on refresh.)
    const spriteSource =
      live.filmstrip_url && live.filmstrip_frame_count
        ? live
        : (use.context.state.effects.find(
            (e) => e.file_hash === live.file_hash && e.filmstrip_url && e.filmstrip_frame_count,
          ) ?? live)

    const spriteUrl = spriteSource.filmstrip_url
    const frameCount = spriteSource.filmstrip_frame_count
    // No sprite (orphan / pre-78m9 data) → flat lane, no broken images.
    if (!spriteUrl || !frameCount || frameCount < 1) {
      return html`<div class="filmstrip"></div>`
    }

    // Effect's real rendered width via the upstream zoom formula (SAME live start/end
    // the inner Effect span uses). 0 width → empty lane (never a NaN-sized div).
    const widthPx = effectWidthPx(live.start, live.end, use.context.state.zoom)
    if (widthPx <= 0) {
      return html`<div class="filmstrip"></div>`
    }

    // SINGLE-DIV filmstrip (openimago-6aew). perf-diag proved JS render is NOT the
    // bottleneck (all labels <0.2ms/s, filmstrip-rebuild=0 — the tatc guard held); the
    // jank is browser PAINT/COMPOSITE of ~290 background-image <div>s × 7+ clips ≈ 2000
    // nodes repainting on every drag frame. Collapse the whole strip to ONE <div> that
    // tiles the source FIRST FRAME with `background-repeat: repeat-x` at a fixed
    // FILMSTRIP_TILE_W×CELL_H cell — visually identical (same first-frame tiling, density
    // follows width since repeat fills it), ~290× fewer nodes per clip.
    //
    // `repeat-x` repeats the WHOLE image, so it cannot pick frame 0 out of the N-frame
    // sprite strip. We crop the sprite's leftmost frame to a standalone dataURL ONCE per
    // sprite (offscreen canvas, cached by URL — filmstrip-frame0.ts) and tile THAT. The
    // crop is async; until it lands we tile the FULL sprite as a transient fallback
    // (`background-size = frameCount*tile × cell` so each frame maps to one cell — the
    // strip's frames briefly repeat instead of just frame 0), then bump state to swap in
    // the exact first frame. By drag time the cache is warm (hydrate ran first), so the
    // fallback is only ever seen on the very first paint of a new source.
    const frame0 = ensureFrame0(spriteUrl, frameCount, () => setFrame0Tick(frame0Tick + 1))

    let bgImage: string
    let bgSize: string
    if (frame0) {
      // EXACT first frame, one cell wide, tiled across the lane.
      bgImage = frame0
      bgSize = `${FILMSTRIP_TILE_W}px ${CELL_H}px`
    } else {
      // Transient fallback before the crop resolves (or null = crop failed): tile the
      // sprite itself, scaling so each of its `frameCount` frames is one cell wide.
      bgImage = spriteUrl
      bgSize = `${FILMSTRIP_TILE_W * Math.max(1, frameCount)}px ${CELL_H}px`
    }

    // CANCEL the parent .content shift (openimago-fsyz). omniclip's Effect view wraps
    // our filmstrip in `<span class="content" style="transform: translateX(
    // -effect.start * 2^zoom)px)">` (effect.js:115) — it assumes content spans the WHOLE
    // source and uses width+overflow to window into the [start,end] trim range. Our
    // strip is sized to the trim WINDOW only (widthPx = (end-start)*2^zoom), so the
    // inherited -inPoint*2^zoom pushes any inPoint>0 clip (a split's second half, or any
    // trimmed segment) entirely out of the visible lane → blank. Apply the exact inverse
    // here so the window-width strip lands back inside the lane for ANY inPoint. Uses
    // `live` (post-split start) and reads state.zoom directly (no subscribe).
    const contentShiftPx = live.start * Math.pow(2, use.context.state.zoom)
    return html`<div
      class="filmstrip"
      style="
        width: ${widthPx}px;
        transform: translateX(${contentShiftPx}px);
        background-image: url('${bgImage}');
        background-repeat: repeat-x;
        background-size: ${bgSize};
        background-position: 0 0;
      "
    ></div>`
  }

  // TEMP perf diagnostic (openimago-v2mm). This whole arrow re-runs once PER VIDEO
  // EFFECT every time the omniclip parent re-renders (drag mousemove → parent watches
  // whole state → repeat(state.effects → VideoEffect)). Two nested labels:
  //  - `video-effect`  : the full per-effect build (filmstrip + the inner Effect view).
  //                      calls ≈ (#video clips) × (frames dragged).
  //  - `effect-inner`  : ONLY the upstream omniclip Effect([...]) view construction
  //                      (the span/trim-handle/transform layer) — point 3's `effect-inner`
  //                      (×N). effect.patch.ts is NOT a render view (it only exports the
  //                      context-menu helpers), so the real inner Effect view is upstream;
  //                      this call site is the faithful place to measure its ×N cost.
  // `video-effect` − `effect-inner` ≈ our (now single-div) filmstrip build cost.
  return perfWrap('video-effect', () => {
    const filmstrip = html`${render_filmstrip()}`
    const styleBlock = css`
      .content {
        width: 100%;
      }
      /* SINGLE-DIV filmstrip (openimago-6aew): one node tiling the source first frame
         via background-repeat:repeat-x at a fixed FILMSTRIP_TILE_W×CELL_H cell (set
         inline). overflow:hidden clips the trailing partial tile and any translateX
         (fsyz) overflow; the inline width is the trim-window width. No flex / no
         per-tile .sprite-cell children anymore — that ~290-node-per-clip subtree was the
         paint/composite hotspot. */
      .filmstrip {
        height: ${CELL_H}px;
        overflow: hidden;
        pointer-events: none;
      }
    `
    return html`${perfWrap('effect-inner', () => Effect([timeline, live, filmstrip, styleBlock]))}`
  })
})
