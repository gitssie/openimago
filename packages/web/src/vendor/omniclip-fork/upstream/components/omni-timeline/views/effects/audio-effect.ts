import {html, GoldElement} from "@benev/slate"

import {Effect} from "./parts/effect.js"
import {shadow_view} from "../../../../context/context.js"
import {AudioEffect as XAudioEffect} from "../../../../context/types.js"
import {calculate_effect_width} from "../../utils/calculate_effect_width.js"
import {BGM_WAVEFORM_COLORS} from "src/utils/cut/fork-contract"

// Flat-green BGM bar (openimago-q4cf), rendered as a LIT-NATIVE node (openimago-ho7e).
//
// REGRESSION FIX: the B.2 fold kept the native pattern of injecting a class-owned raw
// <div> via html`${wave}` (the Waveform controller's `.wave` element). With wavesurfer that
// container had stable internals, but a bare div tripped lit's raw-node handling: on
// re-render / re-mount (re-hydrate, selection) lit ejected the node's ChildPart markers
// ("ChildPart has no parentNode … manipulated outside of Lit's control"), which (a) orphaned
// the old bar in the DOM → multiple identical .bgm-bar divs, and (b) threw inside the render
// path → the editor froze when the audio track re-rendered on click.
//
// Rendering the bar DIRECTLY in this template makes lit fully own it: exactly ONE .bgm-bar
// per audio effect, width recomputed in place on each render, removed cleanly on unmount —
// no Waveform controller, no raw-node injection. The .bgm-bar class still drives the
// BGM-only flat-clip rules in effects/parts/styles.ts. Width tracks the clip duration + zoom
// via calculate_effect_width (zoom-responsive), clamped so a long bed doesn't blow out the
// lane element. The Effect wrapper positions the bar in the audio effect's OWN track row
// (calculate_effect_track_placement(effect.track)).
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

const BAR_HEIGHT = 26
const MAX_BAR_WIDTH = 4000

export const AudioEffect = shadow_view(use => (effect: XAudioEffect, timeline: GoldElement) => {
	use.watch(() => use.context.state)
	const media = use.context.controllers.media
	const compositor = use.context.controllers.compositor

	use.mount(() => {
		// 74y8 compose contract (audio): hydrate re-announces on_media_change("added") after
		// this view mounts, so recreate the audio onto the compositor then (gated by
		// !already-composed). No wavesurfer load / on_file_found anymore.
		const dispose = media.on_media_change(async ({files, action}) => {
			if (action !== "added") return
			for (const {hash} of files) {
				const is_effect_already_composed = compositor.managers.audioManager.get(effect.id)
				if (hash === effect.file_hash && !is_effect_already_composed) {
					compositor.recreate({...use.context.state, effects: [effect]}, media)
				}
			}
		})
		return () => dispose()
	})

	// ONE flat-green bar; width tracks the LIVE effect's duration + zoom, clamped.
	const live = use.context.state.effects.find(e => e.id === effect.id) ?? effect
	const raw = calculate_effect_width(live, use.context.state.zoom)
	const width = Number.isFinite(raw) ? Math.max(0, Math.min(raw, MAX_BAR_WIDTH)) : 0

	return html`${Effect([timeline, effect, html`
		<div
			class="bgm-bar"
			style="
				width: ${width}px;
				height: ${BAR_HEIGHT}px;
				background: ${BGM_WAVEFORM_COLORS.wave};
				border-radius: 4px;
				box-sizing: border-box;
				pointer-events: none;
			"
		></div>
	`])}`
})
