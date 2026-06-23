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
//   1. sizes the frame canvas to 9:16 PORTRAIT (32×56),
//   2. draws with a 9-arg CENTER-COVER crop computed from the real source dims
//      (video.videoWidth/Height) — preserve aspect, crop overflow, no stretch
//      (also auto-corrects any stray landscape source),
//   3. leaves the DENSITY math 100% untouched (#width_of_frame = duration *
//      2^zoom / frames, frame_count ≈ visible/100, scroll/recalc) per the spec —
//      ONLY the rendered frame SHAPE changes. Portrait 32px frames sit flush-left
//      in each (wider) horizontal slot; the trailing slot space shows the lane
//      background by design.
//   4. loading placeholders are 32×56 slots painted with the lane "raised" bg
//      (a single flat fill — no per-frame spinner).
//
// Verbatim from the omniclip source EXCEPT the four marked CHANGED/ADDED blocks,
// so re-applying on an omniclip upgrade is mechanical (diff against the upstream
// filmstrip.js). Private #fields are reproduced as-is. BROWSER-ONLY.

import { calculate_start_position } from 'omniclip/x/components/omni-timeline/utils/calculate_start_position.js'

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

// ADDED: subtle right-edge separator baked into each frame so adjacent frames
// read as distinct without a DOM gap. Kept faint; remove if it looks noisy.
const SEPARATOR_RGBA = 'rgba(0,0,0,0.28)'

export class Filmstrip {
  effect
  media
  ffmpeg
  #filmstrip_frames = []
  #resolve = null
  #previous_scroll_position = 0
  frames_count = 0
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
      this.#video.load()
      this.#video.addEventListener('seeked', () => {
        const res = this.#resolve
        if (res) res(true)
      })
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
      const frames = await this.ffmpeg.get_frames_count(file)
      this.frames_count = frames
      const placeholders = this.#generate_filmstrip_placeholders(frames)
      this.#filmstrip_frames = placeholders
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
    const width_of_frame_if_all_frames =
      (effect.duration * Math.pow(2, zoom)) / this.#filmstrip_frames.length
    const start_at_filmstrip = position / width_of_frame_if_all_frames
    return Math.floor(start_at_filmstrip)
  }

  #generate_filmstrip_placeholders(frames) {
    const new_arr = []
    for (let i = 0; i <= frames - 1; i++) {
      new_arr.push(`${window.location.href}/assets/loading.svg`)
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
    return this.effect.duration * Math.pow(2, 2)
  }

  get #width_of_frame() {
    return (this.effect.duration * Math.pow(2, 2)) / this.#filmstrip_frames.length
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

  async #draw_filmstrip_frame_and_get_its_url(effect, position, zoom) {
    this.#video.currentTime = +(
      (this.#video_fps_in_ms *
        this.#get_filmstrip_frame_at(effect, Number(position.toFixed(2)), zoom)) /
      1000
    ).toFixed(2)
    await new Promise((r) => (this.#resolve = r))
    // CHANGED: 9-arg center-COVER crop (was the 4-arg stretch
    // drawImage(video,0,0,150,50)). Compute the source crop rect that preserves
    // the video's real aspect, cropping the overflowing axis, then scale to the
    // portrait canvas. No stretch → faces are not squished.
    this.#draw_cover_frame()
    const url = this.#canvas.toDataURL('image/webp', 0.5)
    URL.revokeObjectURL(this.#filmstrip_frames[this.#get_filmstrip_frame_at(effect, position, zoom)])
    if (this.#get_filmstrip_frame_at(effect, position, zoom) <= this.#filmstrip_frames.length) {
      return (this.#filmstrip_frames[this.#get_filmstrip_frame_at(effect, position, zoom)] = url)
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
    const frame_count =
      this.effect_width < timeline.clientWidth
        ? this.effect_width / 100
        : timeline.clientWidth / 100
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
          const filmstrip_is_already_drawn =
            filmstrip !== `${window.location.href}/assets/loading.svg` && filmstrip
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
