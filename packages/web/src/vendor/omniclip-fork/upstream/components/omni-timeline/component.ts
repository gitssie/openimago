import {repeat} from "lit/directives/repeat.js"
import {GoldElement, Op, html} from "@benev/slate"

import {styles} from "./styles.js"
import {Track} from "./views/track/view.js"
import {Toolbar} from "./views/toolbar/view.js"
import {Playhead} from "./views/playhead/view.js"
import {TimeRuler} from "./views/time-ruler/view.js"
import {TrackSidebar} from "./views/sidebar/view.js"
import {shadow_component} from "../../context/context.js"
import {TextEffect} from "./views/effects/text-effect.js"
import {VideoEffect} from "./views/effects/video-effect.js"
import {AudioEffect} from "./views/effects/audio-effect.js"
import {ImageEffect} from "./views/effects/image-effect.js"
import {StateHandler} from "../../views/state-handler/view.js"
import {TransitionIndicator} from "./views/indicators/add-transition.js"
import {ProposalIndicator} from "./views/indicators/proposal-indicator.js"
import {calculate_timeline_width} from "./utils/calculate_timeline_width.js"
import {perfCount} from "../../../patches/perf-diag"

export const OmniTimeline = shadow_component(use => {
	use.styles(styles)
	// openimago-oyv0: NARROW the timeline subscription. The old `() => use.context.state`
	// re-rendered the WHOLE timeline — `repeat(state.effects → …)` + `calculate_timeline_width`
	// — on EVERY dispatch, including the per-frame `timecode` tick, the selection write on
	// pointerdown, and EACH per-effect position write a swap emits. Re-render only when the
	// SET/geometry of effects, the track count, or zoom changes (these drive the child list
	// and the timeline width); `timecode`/selection/scroll are handled by the Playhead and
	// the per-clip Effect views' own subscriptions, so they no longer rebuild the whole
	// timeline. Keying on each effect's [id,start,end,start_at_position,track] still fires a
	// re-render on add/remove/split/reorder/move.
	use.watch(() => {
		const s = use.context.state
		return [
			s.zoom,
			s.tracks.length,
			s.effects.length,
			s.effects.map(e => `${e.id}:${e.start}:${e.end}:${e.start_at_position}:${e.track}`).join("|"),
		]
	})
	perfCount("omni-timeline-render") // openimago-oyv0 (perf-diag; DEV-only). REMOVE after verification.
	const state = use.context.state
	const effectTrim = use.context.controllers.timeline.effectTrimHandler
	const effectDrag = use.context.controllers.timeline.effectDragHandler
	const playheadDrag = use.context.controllers.timeline.playheadDragHandler

	// ── openimago-tv19: drag/trim performance — rAF-coalesced pointermove ─────────
	// The window pointermove handler previously ran on EVERY event (100+/sec): two
	// querySelector + getBoundingClientRect layout reads (playhead + effect) plus a
	// composedPath() scan, then a recompute + re-render — and it did this for EVERY
	// pointermove on the page, even when nothing was being dragged. We now:
	//   1. early-out unless a drag / trim / playhead grab is active,
	//   2. coalesce bursts of moves to ≤1 process per animation frame,
	//   3. cache the `.timeline-relative` bounds for the interaction (refreshed only
	//      on scroll / resize / interaction-end),
	//   4. drop the per-move composedPath()/addTrack detection — addTrack is
	//      suppressed and tracks are locked (openimago-5zry), so it is dead weight.

	// --- Perf instrumentation (opt-in: set `window.__cutPerf = true` in the browser
	// --- console). REMOVE once the user confirms the jank is gone (openimago-tv19).
	const __cutPerf = () => (window as unknown as {__cutPerf?: boolean}).__cutPerf === true
	let __perfMoves = 0
	let __perfProcessed = 0
	let __perfWindowStart = 0

	let cached_bounds: DOMRect | null = null
	let pending_event: PointerEvent | null = null
	let raf_id: number | null = null

	const invalidate_bounds = () => {cached_bounds = null}

	const get_timeline_bounds = (): DOMRect | null => {
		if(cached_bounds) {return cached_bounds}
		const t0 = __cutPerf() ? performance.now() : 0
		const timeline = use.shadow.querySelector(".timeline-relative")
		cached_bounds = timeline?.getBoundingClientRect() ?? null
		if(__cutPerf()) {console.log(`[cutPerf] timeline bounds re-measured in ${(performance.now() - t0).toFixed(2)}ms`)}
		return cached_bounds
	}

	const playheadDragOver = (event: PointerEvent) => {
		const bounds = get_timeline_bounds()
		if(bounds) {
			const x = event.clientX - bounds.left
			playheadDrag.move(x >= 0 ? x : 0)
		}
	}

	const effect_drag_over = (event: PointerEvent) => {
		const bounds = get_timeline_bounds()
		if(bounds) {
			const x = event.clientX - bounds.left
			const y = event.clientY - bounds.top
			// addTrack is suppressed (openimago-5zry) and tracks are locked, so the old
			// per-move composedPath()/.indicator-area scan is dead weight — always pass
			// indicator:null. The committed drop in effect-drag.ts forces the same.
			effectDrag.move({coordinates: [x >= 0 ? x : 0, y >= 0 ? y : 0], indicator: null})
		}
	}

	const process_pending_dragover = () => {
		raf_id = null
		const event = pending_event
		pending_event = null
		if(!event) {return}
		const perf = __cutPerf()
		if(perf) {__perfProcessed++}
		const t0 = perf ? performance.now() : 0
		if(effectTrim.grabbed) {
			effectTrim.effect_dragover(event.clientX, use.context.state)
		} else {
			playheadDragOver(event)
			effect_drag_over(event)
		}
		if(perf) {console.log(`[cutPerf] dragover frame processed in ${(performance.now() - t0).toFixed(2)}ms`)}
	}

	function augmented_dragover(event: PointerEvent) {
		if(__cutPerf()) {
			const now = performance.now()
			if(now - __perfWindowStart >= 1000) {
				console.log(`[cutPerf] pointermove ${__perfMoves}/s reaching handler → ${__perfProcessed}/s processed (rAF-coalesced)`)
				__perfMoves = 0
				__perfProcessed = 0
				__perfWindowStart = now
			}
			__perfMoves++
		}
		// Only do layout work while an interaction is active.
		if(!effectTrim.grabbed && !effectDrag.grabbed && !playheadDrag.grabbed) {return}
		pending_event = event
		if(raf_id === null) {raf_id = requestAnimationFrame(process_pending_dragover)}
	}

	const end_drag_interaction = () => {
		if(raf_id !== null) {
			cancelAnimationFrame(raf_id)
			raf_id = null
		}
		pending_event = null
		invalidate_bounds()
	}

	use.mount(() => {
		const layout = document.querySelector("construct-editor")?.shadowRoot?.querySelector(".layout") as HTMLElement
		if(layout) {layout.style.borderRadius = "10px"}
		window.addEventListener("pointermove", augmented_dragover)
		window.addEventListener("pointerup", end_drag_interaction)
		window.addEventListener("pointercancel", end_drag_interaction)
		window.addEventListener("resize", invalidate_bounds)
		// capture:true so a scroll on any nested timeline scroller invalidates the cache.
		window.addEventListener("scroll", invalidate_bounds, true)
		return () => {
			removeEventListener("pointermove", augmented_dragover)
			removeEventListener("pointerup", end_drag_interaction)
			removeEventListener("pointercancel", end_drag_interaction)
			removeEventListener("resize", invalidate_bounds)
			removeEventListener("scroll", invalidate_bounds, true)
			if(raf_id !== null) {cancelAnimationFrame(raf_id)}
		}
	})

	const render_tracks = () => repeat(use.context.state.tracks, ((_track, i) => Track([i], {attrs: {part: "add-track-indicator"}})))
	const render_effects = () => repeat(use.context.state.effects, (effect) => effect.id, (effect) => {
		if(effect.kind === "audio") {
			return AudioEffect([effect, use.element])
		}
		else if (effect.kind === "video") {
			return VideoEffect([effect, use.element])
		}
		else if (effect.kind === "text") {
			return TextEffect([effect, use.element])
		}
		else if(effect.kind === "image") {
			return ImageEffect([effect, use.element])
		}
	})

	const noEffects = use.context.state.effects.length === 0

	// Native empty-timeline placeholder ("Your timeline is empty / Add some media from
	// [panel] panel…") is SUPPRESSED in the embedded cut editor (openimago-l9qs): it is
	// off-design, references a media panel that doesn't exist here, and would flash through
	// during the ~7s hydration window before clips are placed. The host (StoryCutPanel)
	// owns both the hydration loading overlay AND the genuinely-empty-cut state
	// ("尚未生成粗剪" via isEmptyCut), so this branch must never render.
	const renderTimelineInfo = () => null

	const timeline = use.defer(() => use.shadow.querySelector(".timeline-relative")) as GoldElement ?? use.element

	return StateHandler(Op.all(
		use.context.helpers.ffmpeg.is_loading.value,
		use.context.helpers.ffmpeg.is_loading.value), () => html`
		${Toolbar([timeline])}
		<div
			class="timeline"
			style="width: ${calculate_timeline_width(state.effects, state.zoom, use.element)}px;"
		>
			<div class=flex>
				<!-- 60px non-interactive spacer mirroring the track-header gutter width so the
				     TimeRuler stays aligned with clip x-positions (openimago-wmns Pass B.4). The
				     rough-cut editor doesn't expose add-track, so the native 120px button is
				     replaced by this gutter cell whose ONLY job is ruler↔clip alignment. -->
				<div class="ruler-gutter-spacer" aria-hidden="true"></div>
				${TimeRuler([timeline])}
			</div>
			<div class="flex">
				<div class="track-sidebars">
					${use.context.state.tracks.map((t, i) => html`${TrackSidebar([i, t.id])}`)}
				</div>
				<div class=timeline-relative>
					${renderTimelineInfo()}
					${Playhead([use.element])}
					${!noEffects ? render_tracks() : null}
					${render_effects()}
					${ProposalIndicator()}
					${TransitionIndicator()}
				</div>
			</div>
		</div>
 `)
})
