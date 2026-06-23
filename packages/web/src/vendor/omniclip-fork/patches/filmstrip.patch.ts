// PATCH — 9:16 aspect-correct filmstrip frames (openimago-audw, spec openimago-fwzt).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/context/controllers/timeline/parts/filmstrip.js  → class Filmstrip
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts (the
// VideoEffect view does `new Filmstrip(effect, media, ffmpeg)` and calls
// .on_file_found / .recalculate_all_visible_filmstrip_frames / .effect_width /
// .frames_count / .effect_last_offset_left_position / .dispose — all preserved).
//
// WHY: omniclip draws every frame STRETCHED into a 150×50 landscape canvas
// (drawImage(video,0,0,150,50)). Our shot videos are portrait (≈9:16), so faces
// look horizontally squished. This replacement:
//   1. sizes the frame canvas to 9:16 PORTRAIT (28×50 — fits the 50px lane),
//   2. draws with a 9-arg CENTER-COVER crop computed from the real source dims
//      (video.videoWidth/Height) — preserve aspect, crop overflow, no stretch
//      (also auto-corrects any stray landscape source),
//   3. makes the strip DENSE/edge-to-edge: the cell count is a LIVE getter
//      (ceil(effect_width / 28)), so #width_of_frame and the view's render slot
//      both stay ≈28px even after the cut assembler reassigns effect.duration
//      post-init → frames butt together, no gaps (openimago-6br9),
//   4. paints not-yet-drawn cells with a CLEAN baked canvas data-URL solid fill
//      (never the bogus `${location.href}/assets/loading.svg`, which 404s under
//      hash routing → broken-image icons), reused for every placeholder slot.
//
// Verbatim from the omniclip source EXCEPT the four marked CHANGED/ADDED blocks,
// so re-applying on an omniclip upgrade is mechanical (diff against the upstream
// filmstrip.js). Private #fields are reproduced as-is. BROWSER-ONLY.

import { calculate_start_position } from 'omniclip/x/components/omni-timeline/utils/calculate_start_position.js'
import { omnislate } from 'omniclip/x/context/context.js'

// CHANGED: 9:16 portrait frame dimensions (was 150×50 landscape). 28×50 keeps the
// frame EXACTLY within the 50px track lane. omniclip's track placement math is
// hardcoded to 50px (calculate_effect_track_placement / _track_index /
// _closest_track_place: trackHeight=50, y/50), so a taller 56px clip would
// overflow its lane and desync track hit-testing (openimago-fhnz). 28/50 = 0.56
// ≈ 9:16 (0.5625) — the sub-pixel AR delta is invisible. The clip view is
// overflow:hidden, so the 50px-tall frame fills the lane with no clipping.
const FRAME_W = 28
const FRAME_H = 50
// 9:16 target aspect the crop preserves.
const TARGET_AR = FRAME_W / FRAME_H

// DENSE TILING (openimago-6br9). Each filmstrip cell is exactly one FRAME_W-wide
// portrait frame, so frames butt edge-to-edge (a real-NLE continuous strip, no
// gaps). The slot width equals the thumbnail width; the number of cells per clip
// is effect_width / FRAME_W (NOT the upstream ~clipWidth/100 → ~116px gaps).
// .thumbnail is CSS-pinned to FRAME_W (effect-styles.patch.ts) so the img fills
// its cell exactly. Upstream keyed the cell count off the real video frame count;
// here it is the DISPLAY cell count — each cell samples the clip's duration at
// its proportional time (currentTime = duration/cellCount * cellIndex), which is
// the correct filmstrip behavior and keeps #width_of_frame / frames_count /
// #get_filmstrip_frame_at internally consistent. Capped so a very long/zoomed
// clip can't request an unbounded number of WebCodecs extractions.
const SLOT_W = FRAME_W
const MAX_SLOTS = 600

// ADDED: subtle right-edge separator baked into each frame so adjacent frames
// read as distinct without a DOM gap. Kept faint; remove if it looks noisy.
const SEPARATOR_RGBA = 'rgba(0,0,0,0.28)'

// Clean placeholder for not-yet-drawn cells (openimago-6br9). Upstream pushed
// `${window.location.href}/assets/loading.svg`, but under hash routing
// window.location.href is `http://host/#/projects/...` → that URL 404s → broken
// <img> in every undrawn cell. Instead, bake ONE 28×50 canvas solid-fill data-URL
// (data-URLs never 404) in the imago "raised lane" tone (canvas can't read CSS
// vars, so a concrete hex ≈ --imago-bg-raised composited over the clip surface),
// reused for every placeholder slot. Lazy + memoised (no DOM work at import).
let PLACEHOLDER_DATA_URL = ''
function placeholderDataUrl() {
  if (PLACEHOLDER_DATA_URL) return PLACEHOLDER_DATA_URL
  const c = document.createElement('canvas')
  c.width = FRAME_W
  c.height = FRAME_H
  const ctx = c.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#14141f' // ≈ raised lane over the clip --imago-bg-surface
    ctx.fillRect(0, 0, FRAME_W, FRAME_H)
    ctx.fillStyle = SEPARATOR_RGBA
    ctx.fillRect(FRAME_W - 1, 0, 1, FRAME_H)
  }
  PLACEHOLDER_DATA_URL = c.toDataURL('image/webp', 0.4)
  return PLACEHOLDER_DATA_URL
}

export class Filmstrip {
  effect
  media
  ffmpeg
  #filmstrip_frames = []
  #previous_scroll_position = 0
  effect_last_offset_left_position = 0
  #video = document.createElement('video')
  #canvas = document.createElement('canvas')
  #ctx = this.#canvas.getContext('2d')

  constructor(effect, media, ffmpeg) {
    this.effect = effect
    this.media = media
    this.ffmpeg = ffmpeg
    this.#load_video_for_filmstrip()
    this.#init_filmstrip()
    // CHANGED: portrait canvas (was 150×50).
    this.#canvas.width = FRAME_W
    this.#canvas.height = FRAME_H
  }

  async on_file_found() {
    await this.#load_video_for_filmstrip()
    await this.#init_filmstrip()
  }

  async #load_video_for_filmstrip() {
    const file = await this.media.get_file(this.effect.file_hash)
    if (file) {
      this.#video.src = URL.createObjectURL(file)
      // muted + playsInline so some browsers allow off-DOM decode/seek.
      this.#video.muted = true
      this.#video.playsInline = true
      this.#video.preload = 'auto'
      this.#video.load()
      // NOTE (openimago-6br9): the per-cell draw owns a ONE-SHOT 'seeked' await
      // (#seek_and_wait); no persistent listener here — a shared #resolve stomped
      // across rapid dense seeks was the blank/white-frame race.
    }
  }

  dispose() {
    for (const url of this.#filmstrip_frames) {
      URL.revokeObjectURL(url)
    }
  }

  async #init_filmstrip() {
    const file = await this.media.get_file(this.effect.file_hash)
    if (file) {
      // get_frames_count is still awaited to keep the WebCodecs/cache path warm
      // (don't regress the extraction fix) but no longer drives the cell count —
      // that is now the LIVE `frames_count` getter (openimago-6br9). Seed the
      // drawn-URL cache with loading placeholders for the CURRENT cell count; the
      // cache is sparse/index-keyed so it tolerates the count changing later.
      await this.ffmpeg.get_frames_count(file)
      this.#filmstrip_frames = this.#generate_filmstrip_placeholders(this.frames_count)
    }
  }

  #is_scrolling_left(left) {
    let going_left = false
    if (left < this.#previous_scroll_position) {
      going_left = true
    }
    this.#previous_scroll_position = left
    return going_left
  }

  #get_filmstrip_frame_at(effect, position, zoom) {
    // Divide by the LIVE frames_count (NOT #filmstrip_frames.length, which is a
    // stale cache seed). Keeps the cell-index mapping consistent with the live
    // #width_of_frame / render-slot width even after the effect duration changes.
    const width_of_frame_if_all_frames = (effect.duration * Math.pow(2, zoom)) / this.frames_count
    const start_at_filmstrip = position / width_of_frame_if_all_frames
    return Math.floor(start_at_filmstrip)
  }

  #generate_filmstrip_placeholders(frames) {
    const placeholder = placeholderDataUrl()
    const new_arr = []
    for (let i = 0; i <= frames - 1; i++) {
      new_arr.push(placeholder)
    }
    return new_arr
  }

  get #video_fps() {
    return (this.frames_count / this.effect.duration) * 1000
  }

  get #video_fps_in_ms() {
    return 1000 / this.#video_fps
  }

  get effect_width() {
    // REAL rendered clip width in CSS px (openimago-6br9). MUST equal what the
    // timeline lays the clip out at — omniclip's calculate_effect_width is
    // (effect.end - effect.start) * 2^zoom with the LIVE state zoom — otherwise
    // frames_count (= ceil(effect_width/28)) is computed against the wrong width
    // and the view's slot (effect_width/frames_count) drifts off 28px → gaps. The
    // VideoEffect view reads THIS getter for both the cell position and width, so
    // keying it to the live zoom makes the rendered slot exactly ≈28px. (Was a
    // hardcoded 2^2, which only matched at zoom===2 → gaps at other zooms.)
    const span =
      typeof this.effect.end === 'number' && typeof this.effect.start === 'number'
        ? this.effect.end - this.effect.start
        : this.effect.duration
    const zoom = omnislate?.context?.state?.zoom
    const z = typeof zoom === 'number' ? zoom : 2
    return span * Math.pow(2, z)
  }

  /**
   * LIVE cell count (openimago-6br9). Computed from the CURRENT effect_width on
   * every read, NOT frozen at init — the cut assembler reassigns effect.duration
   * AFTER the Filmstrip is constructed, and the VideoEffect view reads both
   * `filmstrip.frames_count` and `filmstrip.effect_width` at render time. Keying
   * the count off the same live effect_width guarantees the view's slot width
   * (effect_width / frames_count) and the draw slot (#width_of_frame) are BOTH
   * exactly SLOT_W ≈ 28px for every clip → frames butt edge-to-edge. ceil keeps
   * the slot ≤ SLOT_W (never a gap); clamped to [1, MAX_SLOTS].
   */
  get frames_count() {
    return Math.max(1, Math.min(MAX_SLOTS, Math.ceil(this.effect_width / SLOT_W)))
  }

  get #width_of_frame() {
    // Derive from the live frames_count so it == the view's render slot width
    // (effect_width / frames_count) regardless of post-init duration changes.
    return this.effect_width / this.frames_count
  }

  *#yield_loading_placeholders(frame_count, normalized_left, effect, zoom) {
    for (let i = 0; i <= frame_count; i += 1) {
      const position = normalized_left + this.#width_of_frame * i
      if (position <= this.effect_width) {
        yield {
          url: this.#filmstrip_frames[this.#get_filmstrip_frame_at(effect, position, zoom)],
          normalized_left,
          i,
        }
      }
    }
  }

  /**
   * Resolve once the <video> has DECODED data ready (readyState >= 2 /
   * HAVE_CURRENT_DATA). Bounded by a timeout so a stalled load can't hang the
   * strip. (openimago-6br9: clip 0's near-t=0 cells were drawn before the very
   * first frame decoded → blank white; readiness must gate EVERY draw, including
   * the already-at-target case.)
   */
  #wait_ready() {
    return new Promise((resolve) => {
      const video = this.#video
      if (video.readyState >= 2) {
        resolve(true)
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        video.removeEventListener('loadeddata', finish)
        video.removeEventListener('canplay', finish)
        clearTimeout(timer)
        resolve(true)
      }
      video.addEventListener('loadeddata', finish)
      video.addEventListener('canplay', finish)
      const timer = setTimeout(finish, 3000)
    })
  }

  /**
   * Seek the shared <video> to `seconds` and resolve only once a REAL decoded
   * frame at that time is presentable, so the caller never drawImage()s a blank
   * canvas (openimago-6br9). Sequence: (1) await readiness (readyState >= 2) —
   * applies even when already at the target time, which is exactly the clip-0 /
   * t=0 case that previously fast-pathed into a blank draw; (2) if not already at
   * `seconds`, seek and await one-shot 'seeked' (1.5s fallback so a missing event
   * can't hang); (3) await one requestVideoFrameCallback (fallback rAF) so the
   * decoded frame is actually presented. The recalc loop awaits each call →
   * seeks serialize and never stomp on the single shared element.
   */
  async #seek_and_wait(seconds) {
    const video = this.#video
    // (1) GATE on decoded data first — never draw before the first frame exists.
    await this.#wait_ready()
    // (2) Seek only if we're not already at this time (a no-op set emits no
    // 'seeked'); otherwise skip straight to presenting the current frame.
    if (Math.abs(video.currentTime - seconds) >= 0.001) {
      await new Promise((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          video.removeEventListener('seeked', finish)
          clearTimeout(timer)
          resolve(true)
        }
        video.addEventListener('seeked', finish)
        const timer = setTimeout(finish, 1500)
        video.currentTime = seconds
      })
    }
    // (3) Ensure a real frame is PRESENTED before the caller draws.
    await new Promise((resolve) => {
      const rvfc = video.requestVideoFrameCallback
      if (typeof rvfc === 'function') rvfc.call(video, () => resolve(true))
      else requestAnimationFrame(() => resolve(true))
    })
  }

  async #draw_filmstrip_frame_and_get_its_url(effect, position, zoom) {
    const seconds = +(
      (this.#video_fps_in_ms *
        this.#get_filmstrip_frame_at(effect, Number(position.toFixed(2)), zoom)) /
      1000
    ).toFixed(2)
    // AWAIT the seek+decode before drawing (was: set currentTime then draw via a
    // stomped shared resolver → blank/white frames under dense seeks).
    await this.#seek_and_wait(seconds)
    // 9-arg center-COVER crop (preserve source aspect, crop overflow, no stretch).
    this.#draw_cover_frame()
    const url = this.#canvas.toDataURL('image/webp', 0.5)
    const idx = this.#get_filmstrip_frame_at(effect, position, zoom)
    URL.revokeObjectURL(this.#filmstrip_frames[idx])
    // Guard against the live frames_count (the cache array may be a stale seed
    // length after a post-init duration change); a sparse write auto-extends it.
    if (idx >= 0 && idx <= this.frames_count) {
      return (this.#filmstrip_frames[idx] = url)
    } else return undefined
  }

  // ADDED: center-cover draw helper (the core 9:16 fix).
  #draw_cover_frame() {
    const ctx = this.#ctx
    if (!ctx) return
    const vw = this.#video.videoWidth
    const vh = this.#video.videoHeight
    const cw = this.#canvas.width
    const ch = this.#canvas.height
    if (!vw || !vh) {
      // No decoded dims yet — clear so we never blit a stale/garbage frame.
      ctx.clearRect(0, 0, cw, ch)
      return
    }
    const srcAR = vw / vh
    let sw, sh, sx, sy
    if (srcAR > TARGET_AR) {
      // Source wider than 9:16 → crop the sides.
      sh = vh
      sw = vh * TARGET_AR
      sx = (vw - sw) / 2
      sy = 0
    } else {
      // Source taller/narrower → crop top/bottom.
      sw = vw
      sh = vw / TARGET_AR
      sx = 0
      sy = (vh - sh) / 2
    }
    ctx.clearRect(0, 0, cw, ch)
    ctx.drawImage(this.#video, sx, sy, sw, sh, 0, 0, cw, ch)
    // Faint right-edge separator so abutting frames read as distinct.
    ctx.fillStyle = SEPARATOR_RGBA
    ctx.fillRect(cw - 1, 0, 1, ch)
  }

  async *recalculate_all_visible_filmstrip_frames(effect, timeline, zoom, force_recalculate) {
    const margin = this.#width_of_frame * 2
    // CHANGED (openimago-6br9): step the visible window by #width_of_frame (≈28px,
    // = one frame) instead of the upstream /100, so the drawn frames cover the
    // whole visible span edge-to-edge with no gaps. (Was effect_width/100 →
    // ~1 frame per 100px → sparse strip.) +1 so the right edge is fully covered.
    const frame_count =
      Math.ceil(
        (this.effect_width < timeline.clientWidth ? this.effect_width : timeline.clientWidth) /
          this.#width_of_frame,
      ) + 1
    const effect_left = calculate_start_position(effect.start_at_position - effect.start, zoom)
    const normalized_left =
      Math.floor((timeline.scrollLeft - effect_left) / this.#width_of_frame) * this.#width_of_frame -
        margin <
      0
        ? 0
        : Math.floor((timeline.scrollLeft - effect_left) / this.#width_of_frame) *
            this.#width_of_frame -
          margin
    const scroll_move_is_bigger_than_width_of_frame =
      Math.abs(normalized_left - this.effect_last_offset_left_position) >=
      Math.floor(this.#width_of_frame)
    const should_load_new_filmstrip_frames =
      force_recalculate ?? scroll_move_is_bigger_than_width_of_frame
    if (should_load_new_filmstrip_frames) {
      for (const placeholder of this.#yield_loading_placeholders(
        frame_count,
        normalized_left,
        effect,
        zoom,
      ))
        yield placeholder
      const is_left = this.#is_scrolling_left(timeline.scrollLeft)
      const count = is_left ? 0 : frame_count
      for (
        let i = is_left ? frame_count : 0;
        is_left ? i >= count : i <= count;
        is_left ? (i -= 1) : (i += 1)
      ) {
        const position = normalized_left + this.#width_of_frame * i
        if (position <= this.effect_width) {
          const filmstrip = this.#filmstrip_frames[this.#get_filmstrip_frame_at(effect, position, zoom)]
          // "Already drawn" = a real frame URL, i.e. present and NOT the clean
          // placeholder (openimago-6br9; was a comparison to the bogus loading.svg).
          const filmstrip_is_already_drawn = !!filmstrip && filmstrip !== placeholderDataUrl()
          if (filmstrip_is_already_drawn) {
            yield { url: filmstrip, normalized_left, i: Math.floor(i) }
          } else {
            const url = await this.#draw_filmstrip_frame_and_get_its_url(effect, position, zoom)
            if (url) yield { url, normalized_left, i: Math.floor(i) }
          }
        }
      }
    }
  }
}
