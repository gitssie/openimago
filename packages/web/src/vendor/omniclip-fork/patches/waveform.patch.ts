// PATCH — green BGM waveform (openimago-r7to).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/context/controllers/timeline/parts/waveform.js  → export class `Waveform`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipWaveformPatch), guarding the relative
// `../../../../context/controllers/timeline/parts/waveform.js` import from the
// audio-effect view.
//
// ROOT CAUSE (confirmed live, openimago-r7to): the BGM audio effect imports fine
// (HTTP 200), the file_hash MATCHES what media.get_file() resolves, the bytes
// decode (decodeAudioData ~136ms), and WaveSurfer DOES reach "ready" even with a
// 0-width container — so it was NEITHER a hash-mismatch NOR a reflow-timing
// stall. The upstream Waveform set NO `waveColor`/`progressColor`, so WaveSurfer
// rendered in its near-invisible DEFAULT gray against the dark navy lane → the
// lane read as "blank, not green". Live pixel-probe proof: passing a green
// waveColor renders ~12.5k canvas pixels at that exact green.
//
// FIX: this drop-in mirrors upstream's logic EXACTLY (same WaveSurfer.create
// options, same #load_audio_file / update_waveform / on_file_found / dispose
// behaviour, same media.get_file(effect.file_hash) lookup) and ONLY adds the
// green waveColor/progressColor from the host theme (BGM_WAVEFORM_COLORS in
// fork-contract). Colors must be JS options, not CSS vars: WaveSurfer renders its
// canvas into its OWN shadow root, which --imago-* would not inherit into.
//
// NON-FATAL: a waveform failure must not crash the editor — #load_audio_file
// swallows + warns on its own failure (get_file/decode/load), exactly as the
// import path is non-fatal, so the lane just stays unrendered rather than
// throwing out of the AudioEffect view's mount.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

// Import the explicit dist subpath (not the bare 'wavesurfer.js' specifier): the
// fork lives in src/, so it does not see omniclip's importmap. The gated subpath
// resolver in quasar.config.ts maps `wavesurfer.js/<subpath>` → the physical
// node_modules file (openimago-r7to), matching how the other vendor deps resolve.
import WaveSurfer from 'wavesurfer.js/dist/wavesurfer.js'
import { fetchFile } from '@ffmpeg/util/dist/esm/index.js'
import { calculate_effect_width } from 'omniclip/x/components/omni-timeline/utils/calculate_effect_width.js'
import { BGM_WAVEFORM_COLORS } from 'src/utils/cut/fork-contract'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEffect = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMedia = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyState = any

export class Waveform {
  effect: AnyEffect
  media: AnyMedia
  wave = document.createElement('div')
  #wavesurfer: WaveSurfer
  #isReady = false

  constructor(effect: AnyEffect, media: AnyMedia, state: AnyState) {
    this.effect = effect
    this.media = media
    this.#wavesurfer = this.#create_waveform()
    void this.#load_audio_file(state)
    this.#wavesurfer.on('ready', () => {
      this.#isReady = true
    })
  }

  #create_waveform(): WaveSurfer {
    return WaveSurfer.create({
      container: this.wave,
      // backend kept for parity with upstream (ignored by WaveSurfer v7).
      backend: 'MediaElement',
      autoScroll: true,
      hideScrollbar: true,
      interact: false,
      height: 50,
      // openimago-r7to: the ONLY behavioural change vs upstream — the green that
      // makes the lane match docs/images/cut_panel.png.
      waveColor: BGM_WAVEFORM_COLORS.wave,
      progressColor: BGM_WAVEFORM_COLORS.progress,
    } as Parameters<typeof WaveSurfer.create>[0])
  }

  async on_file_found(state: AnyState): Promise<void> {
    await this.#load_audio_file(state)
  }

  async #load_audio_file(state: AnyState): Promise<void> {
    try {
      this.#wavesurfer.setOptions({ width: calculate_effect_width(this.effect, state.zoom) })
      const file = await this.media.get_file(this.effect.file_hash)
      if (file) {
        const uint = await fetchFile(file)
        const blob = new Blob([uint])
        const url = URL.createObjectURL(blob)
        await this.#wavesurfer.load(url)
        this.update_waveform(state)
      }
    } catch (err) {
      // NON-FATAL (openimago-r7to/tc8t): a waveform draw failure must not bubble
      // out of the AudioEffect view's mount and crash the editor — warn + skip.
      console.warn('[omniclip-fork] BGM waveform render failed — lane left blank', err)
    }
  }

  update_waveform(state: AnyState): void {
    if (this.#isReady) {
      const get_effect = state.effects.find((e: AnyEffect) => e.id === this.effect.id)
      const width = get_effect.duration * Math.pow(2, state.zoom)
      if (width < 4000) {
        this.#wavesurfer.setOptions({ width })
      } else {
        this.#wavesurfer.setOptions({ width: 4000 })
      }
      this.#wavesurfer.zoom(width / this.#wavesurfer.getDuration())
    }
  }

  dispose(): void {
    this.#wavesurfer.destroy()
  }
}
