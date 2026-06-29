// PATCH — flat green BGM bar, NO waveform (openimago-q4cf, supersedes -r7to).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/context/controllers/timeline/parts/waveform.js  → export class `Waveform`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipWaveformPatch), guarding the relative
// `../../../../context/controllers/timeline/parts/waveform.js` import from the
// audio-effect view (x/components/omni-timeline/views/effects/audio-effect.js).
//
// WHY (USER DECISION — "声音不需要去解析，不需要有波浪线"): the BGM lane must NOT
// parse/decode audio and must NOT draw a waveform. The approved reference
// (docs/images/cut_panel.png) shows the BGM lane as a SOLID flat rounded GREEN
// clip block, not a sampled waveform. So this drop-in DROPS WaveSurfer, the
// @ffmpeg/util fetchFile, media.get_file(), and the Blob/URL decode path
// entirely, and instead renders `this.wave` as a flat green <div> sized to the
// effect's width. Zero audio I/O — the lane is pure CSS fill.
//
// PUBLIC INTERFACE PRESERVED (so the AudioEffect view that mounts this is
// unchanged): constructor(effect, media, state), the `wave` element property,
// on_file_found(state), update_waveform(state), dispose(). The view reads
// `wave.wave` once, then calls update_waveform on zoom changes, on_file_found
// when the media is added, and dispose() on unmount — all kept, each just
// re-sizes (or tears down) the green block.
//
// WIDTH still comes from calculate_effect_width(effect, state.zoom) so the bar
// tracks the clip length on zoom — identical sizing math to upstream, minus the
// decode. The Effect wrapper positions/clips the block; `this.wave` fills it.
//
// GREEN: BGM_WAVEFORM_COLORS.wave (#4ec273) from fork-contract, now applied as an
// inline CSS background on the <div> (a flat fill, no <canvas>, so the color no
// longer needs to be a JS WaveSurfer option). The soft CapCut green of the ref.
//
// NON-FATAL: any failure while sizing the block must warn + leave the lane blank,
// never throw out of the AudioEffect view's mount.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { calculate_effect_width } from 'omniclip/x/components/omni-timeline/utils/calculate_effect_width.js'
import { BGM_WAVEFORM_COLORS } from 'src/utils/cut/fork-contract'
import { perfWrap } from './perf-diag' // TEMP perf diagnostic (openimago-v2mm)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEffect = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMedia = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any

/** Green-bar height (px). The audio `.effect` block is 50px tall with
 *  `align-items: center`, so a SHORTER bar reads as the thin green clip the
 *  reference (docs/images/cut_panel.png) shows — a flat green strip centered in
 *  its lane, visibly shorter than the filmstrip clips above it. */
const BAR_HEIGHT = 26
/** Upstream capped the rendered width at 4000px; keep the same clamp so very
 *  long beds at high zoom don't blow out the lane element. */
const MAX_BAR_WIDTH = 4000

export class Waveform {
  effect: AnyEffect
  media: AnyMedia
  wave = document.createElement('div')

  constructor(effect: AnyEffect, media: AnyMedia, state: AnyState) {
    this.effect = effect
    this.media = media
    // Tag the bar so the SHARED effect stylesheet can scope AUDIO-only rules via
    // `.effect:has(.bgm-bar)` — the effect shadow root carries no kind attribute,
    // so this class is the only signal that "this clip is the BGM lane". Used by
    // effect-styles.patch.ts to keep the BGM clip CLEAN: no selection/hover
    // outline bleeding below the (shorter, centered) green bar as a teal line,
    // and no grey grab/trim grip on its left edge.
    this.wave.className = 'bgm-bar'
    this.#style_bar()
    this.#resize(state)
  }

  /** Paint `this.wave` as a flat, rounded, soft-green block (no canvas, no audio).
   *  Width is set per-state by #resize; everything else is static. */
  #style_bar(): void {
    const s = this.wave.style
    s.height = `${BAR_HEIGHT}px`
    s.background = BGM_WAVEFORM_COLORS.wave
    s.borderRadius = '4px'
    // The Effect wrapper already clips the clip block; keep the fill inside it.
    s.boxSizing = 'border-box'
    s.pointerEvents = 'none'
  }

  /** Re-derive the bar width from the effect length + current zoom and apply it.
   *  Same sizing math as upstream's #load_audio_file / update_waveform, minus the
   *  decode. NON-FATAL: a failure here warns and leaves the lane blank. */
  #resize(state: AnyState): void {
    // TEMP perf diagnostic (openimago-v2mm): the BGM lane is a class, not a render
    // view — #resize (the width math behind update_waveform + on_file_found) is its
    // only per-state work, so time THAT under `waveform`. It's driven by zoom/effect
    // changes, NOT every drag frame, so during a pure clip-drag its `calls` should be
    // ~0; a spike means the BGM lane is being re-sized on the drag hot path.
    perfWrap('waveform', () => {
      try {
        const live = state.effects?.find((e: AnyEffect) => e.id === this.effect.id) ?? this.effect
        const raw = calculate_effect_width(live, state.zoom)
        const width = Number.isFinite(raw) ? Math.min(raw, MAX_BAR_WIDTH) : 0
        this.wave.style.width = `${Math.max(0, width)}px`
      } catch (err) {
        // NON-FATAL (openimago-q4cf): a sizing failure must not bubble out of the
        // AudioEffect view's mount and crash the editor — warn + leave it blank.
        console.warn('[omniclip-fork] BGM green bar sizing failed — lane left blank', err)
      }
    })
  }

  /** Media became available — there is nothing to decode now, just (re)size the
   *  green bar so it matches the clip on the lane. Kept for interface parity. */
  async on_file_found(state: AnyState): Promise<void> {
    this.#resize(state)
  }

  /** Zoom / effect changed — resize the green bar to the new clip width. */
  update_waveform(state: AnyState): void {
    this.#resize(state)
  }

  /** Tear down — no WaveSurfer instance to destroy now; clear the bar fill. */
  dispose(): void {
    this.wave.replaceChildren()
    this.wave.removeAttribute('style')
  }
}
