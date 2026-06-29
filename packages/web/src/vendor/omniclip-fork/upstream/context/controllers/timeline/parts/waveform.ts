import {Media} from '../../media/controller.js'
import {AudioEffect, State} from '../../../types.js'
import {calculate_effect_width} from '../../../../components/omni-timeline/utils/calculate_effect_width.js'
import {BGM_WAVEFORM_COLORS} from 'src/utils/cut/fork-contract'

// Flat GREEN BGM bar — NO waveform (openimago-q4cf; folded into the vendored source in
// openimago-wmns Pass B.2, replacing waveform.patch.ts's resolveId redirect).
//
// USER DECISION ("声音不需要去解析，不需要有波浪线"): the BGM lane must NOT decode audio and
// must NOT draw a sampled waveform. The approved reference (docs/images/cut_panel.png)
// shows the BGM lane as a SOLID flat rounded GREEN block. So this DROPS WaveSurfer, the
// @ffmpeg/util fetchFile, media.get_file(), and the Blob/URL decode path entirely, and
// renders `this.wave` as a flat green <div> sized to the effect's width. Zero audio I/O.
//
// PUBLIC INTERFACE PRESERVED so the vendored AudioEffect view (audio-effect.ts) is
// unchanged: constructor(effect, media, state), the `wave` element, on_file_found(state),
// update_waveform(state), dispose() — each just (re)sizes or tears down the green block.
// WIDTH still comes from calculate_effect_width(effect, zoom) so the bar tracks clip
// length on zoom (same sizing math as upstream, minus the decode).
//
// GREEN: BGM_WAVEFORM_COLORS.wave (#4ec273) from fork-contract, applied as an inline CSS
// background (a flat fill, no <canvas>). NON-FATAL: a sizing failure warns + leaves the
// lane blank, never throwing out of the AudioEffect view's mount.
//
// NOTE: wavesurfer.js is no longer imported here; the dep stays installed (harmless;
// removal is phase-5 cleanup, openimago-ln7d).
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

/** Green-bar height (px). The audio `.effect` block is 50px tall with align-items:center,
 *  so a SHORTER bar reads as the thin green clip the reference shows — a flat green strip
 *  centered in its lane, visibly shorter than the filmstrip clips above it. */
const BAR_HEIGHT = 26
/** Upstream capped the rendered width at 4000px; keep the same clamp so very long beds at
 *  high zoom don't blow out the lane element. */
const MAX_BAR_WIDTH = 4000

export class Waveform {
	wave = document.createElement("div")

	constructor(private effect: AudioEffect, private media: Media, state: State) {
		// Tag the bar so the shared effect stylesheet can scope AUDIO-only rules via
		// `.effect:has(.bgm-bar)` (the effect shadow root carries no kind attribute) — keeps
		// the BGM clip CLEAN (no selection/hover outline bleeding below the shorter green bar
		// as a teal line, no grey grab/trim grip). See effects/parts/styles.ts imago overrides.
		this.wave.className = "bgm-bar"
		this.#style_bar()
		this.#resize(state)
	}

	/** Paint `this.wave` as a flat, rounded, soft-green block (no canvas, no audio). Width is
	 *  set per-state by #resize; everything else is static. */
	#style_bar() {
		const s = this.wave.style
		s.height = `${BAR_HEIGHT}px`
		s.background = BGM_WAVEFORM_COLORS.wave
		s.borderRadius = "4px"
		s.boxSizing = "border-box"
		s.pointerEvents = "none"
	}

	/** Re-derive the bar width from the effect length + current zoom and apply it. Same
	 *  sizing math as upstream's #load_audio_file / update_waveform, minus the decode.
	 *  NON-FATAL: a failure warns and leaves the lane blank. */
	#resize(state: State) {
		try {
			const live = (state.effects?.find(e => e.id === this.effect.id) ?? this.effect) as AudioEffect
			const raw = calculate_effect_width(live, state.zoom)
			const width = Number.isFinite(raw) ? Math.min(raw, MAX_BAR_WIDTH) : 0
			this.wave.style.width = `${Math.max(0, width)}px`
		} catch (err) {
			console.warn("[omniclip-fork] BGM green bar sizing failed — lane left blank", err)
		}
	}

	/** Media became available — nothing to decode, just (re)size the green bar. */
	async on_file_found(state: State) {
		this.#resize(state)
	}

	/** Zoom / effect changed — resize the green bar to the new clip width. */
	update_waveform(state: State) {
		this.#resize(state)
	}

	/** Tear down — no WaveSurfer instance to destroy now; clear the bar fill. */
	dispose() {
		this.wave.replaceChildren()
		this.wave.removeAttribute("style")
	}
}
