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
	// timeline.
	//
	// openimago-uwcc: DROP start_at_position from the per-effect key — a pure reorder must NOT
	// re-render the whole timeline (the redundant ~30/2-pass effect-inner-render at drop):
	//   (a) the moved/pushed clips already reposition via their OWN inner-Effect watch (which
	//       KEEPS start_at_position) — the parent rebuild is redundant;
	//   (b) calculate_timeline_width = furthest start_at_position+duration = TOTAL duration,
	//       invariant under a no-gap ripple reorder, so the width doesn't change;
	//   (c) the repeat() is keyed by id and apply_reorder changes position VALUES not array
	//       order, so the keyed DOM order is unchanged.
	// trim (start/end → width), add/remove (effects.length → list+width), track and zoom STILL
	// re-render the timeline; only a pure position reorder no longer does.
	use.watch(() => {
		const s = use.context.state
		return [
			s.zoom,
			s.tracks.length,
			s.effects.length,
			s.effects.map(e => `${e.id}:${e.start}:${e.end}:${e.track}`).join("|"),
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

	// ── openimago-7ca2: DRAG-SCOPED FRAME MONITOR (opt-in: window.__cutPerf) ──────────
	// The perf-diag JS-render counters came back ~0ms yet the user still feels heavy
	// jank, so the cost is in browser PAINT/COMPOSITE (PIXI 1920x1080 WebGL canvas, or
	// GPU paint of a multi-thousand-px tiled filmstrip), which JS timers don't capture.
	// While a clip/trim is grabbed a rAF loop records the inter-frame delta; on drop we
	// log frame count, max, mean, and #frames over 16/32/50ms — proving whether the main
	// thread is blowing the frame budget and how badly. REMOVE after the hot path is
	// localized. (Implemented inline rather than in perf-diag because this is a one-shot
	// per-drag summary, not perf-diag's once-per-second bucket flush.)
	let frame_raf: number | null = null
	let frame_last = 0
	let frame_count = 0
	let frame_max = 0
	let frame_sum = 0
	let frame_over16 = 0
	let frame_over32 = 0
	let frame_over50 = 0

	const frame_tick = (now: number) => {
		if(frame_last > 0) {
			const dt = now - frame_last
			frame_count++
			frame_sum += dt
			if(dt > frame_max) {frame_max = dt}
			if(dt > 16.7) {frame_over16++}
			if(dt > 32) {frame_over32++}
			if(dt > 50) {frame_over50++}
		}
		frame_last = now
		frame_raf = requestAnimationFrame(frame_tick)
	}

	const start_frame_monitor = () => {
		if(!__cutPerf() || frame_raf !== null) {return}
		frame_last = 0; frame_count = 0; frame_max = 0; frame_sum = 0
		frame_over16 = 0; frame_over32 = 0; frame_over50 = 0
		frame_raf = requestAnimationFrame(frame_tick)
	}

	const stop_frame_monitor = () => {
		if(frame_raf === null) {return}
		cancelAnimationFrame(frame_raf)
		frame_raf = null
		if(__cutPerf() && frame_count > 0) {
			const mean = frame_sum / frame_count
			console.log(`[cutPerf] DRAG FRAMES: count=${frame_count} max=${frame_max.toFixed(1)}ms mean=${mean.toFixed(1)}ms over16=${frame_over16} over32=${frame_over32} over50=${frame_over50}`)
		}
	}

	// ── openimago-fgec: DROP-COMMIT frame monitor (opt-in: window.__cutPerf) ──────────
	// The DRAG monitor above STOPS at pointerup, so the drop/commit frame — where the
	// reorder dispatch fires (effect-manager → push effects → state → recompose/repaint)
	// — has been our BLIND SPOT. The user localizes the jank to the DROP, so keep sampling
	// inter-frame ms for the ~500ms commit window after pointerup and log the worst frame +
	// when it settled. Compare longestFrame here against the [perf-diag] compose_effects /
	// video-decode counts to tell paint-of-the-ripple from a wasteful preview recompose.
	const COMMIT_WINDOW_MS = 500
	let commit_raf: number | null = null
	let commit_start = 0
	let commit_last = 0
	let commit_count = 0
	let commit_longest = 0
	let commit_over32 = 0
	let commit_settle = 0 // elapsed ms (from drop) at the END of the last >16ms frame

	const commit_tick = (now: number) => {
		if(commit_last > 0) {
			const dt = now - commit_last
			commit_count++
			if(dt > commit_longest) {commit_longest = dt}
			if(dt > 32) {commit_over32++}
			if(dt > 16.7) {commit_settle = now - commit_start}
		}
		commit_last = now
		if(now - commit_start < COMMIT_WINDOW_MS) {
			commit_raf = requestAnimationFrame(commit_tick)
		} else {
			commit_raf = null
			if(__cutPerf() && commit_count > 0) {
				console.log(`[cutPerf] DROP COMMIT: longestFrame=${commit_longest.toFixed(1)}ms frames=${commit_count} over32=${commit_over32} settleMs=${commit_settle.toFixed(0)}`)
			}
		}
	}

	const start_commit_monitor = () => {
		if(!__cutPerf()) {return}
		if(commit_raf !== null) {cancelAnimationFrame(commit_raf)}
		commit_start = performance.now()
		commit_last = 0; commit_count = 0; commit_longest = 0; commit_over32 = 0; commit_settle = 0
		commit_raf = requestAnimationFrame(commit_tick)
	}

	let cached_bounds: DOMRect | null = null
	let pending_event: PointerEvent | null = null
	let raf_id: number | null = null

	// openimago-u7kw: NLE edge auto-scroll state.
	let autoscroll_raf: number | null = null
	let autoscroll_pointer: PointerEvent | null = null

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

	// ── openimago-u7kw: NLE edge auto-scroll ──────────────────────────────────────────
	// While a clip/trim is grabbed and the pointer is within EDGE_PX of the host viewport
	// edge, scroll the timeline that way (speed ramps with proximity). This runs its OWN rAF
	// loop so it keeps scrolling even when the pointer is held STILL at the edge. Each scroll
	// step reprocesses the LAST pointer (y8qw direct transform on the grabbed nodes +
	// republished effectDrag.move / trim) so the grabbed clip + proposal indicator track the
	// newly-revealed position. The host (use.element, styles.ts :host{overflow:scroll}) is the
	// scroll viewport; setting scrollLeft synchronously moves the content, so we invalidate the
	// cached .timeline-relative bounds and re-measure for the position recompute.
	const AUTOSCROLL_EDGE_PX = 48
	const AUTOSCROLL_MAX_SPEED = 25

	const autoscroll_tick = () => {
		autoscroll_raf = null
		const ev = autoscroll_pointer
		if(!ev || (!effectDrag.grabbed && !effectTrim.grabbed)) {return}
		const host = use.element as HTMLElement
		const rect = host.getBoundingClientRect()
		const maxScroll = host.scrollWidth - host.clientWidth
		let dir = 0
		let dist = 0
		if(ev.clientX < rect.left + AUTOSCROLL_EDGE_PX) {
			dir = -1; dist = (rect.left + AUTOSCROLL_EDGE_PX) - ev.clientX
		} else if(ev.clientX > rect.right - AUTOSCROLL_EDGE_PX) {
			dir = 1; dist = ev.clientX - (rect.right - AUTOSCROLL_EDGE_PX)
		}
		if(dir !== 0) {
			const proximity = Math.min(1, dist / AUTOSCROLL_EDGE_PX) // 0..1 ramp toward the edge
			const speed = Math.max(1, Math.round(proximity * AUTOSCROLL_MAX_SPEED))
			const before = host.scrollLeft
			const next = Math.max(0, Math.min(maxScroll, before + dir * speed))
			if(next !== before) {
				host.scrollLeft = next
				// scrollLeft moves the content synchronously; the host 'scroll' event +
				// invalidate_bounds fire async, so re-measure NOW for a correct position calc.
				invalidate_bounds()
				const bounds = get_timeline_bounds()
				if(bounds) {
					// keep the grabbed clip tracking the cursor in CONTENT coords (y8qw direct write)
					const dn = effectDrag.directNodes
					if(dn && effectDrag.grabbed) {
						const coordX = Math.max(0, ev.clientX - bounds.left)
						const coordY = Math.max(0, ev.clientY - bounds.top)
						const t = `translate(${coordX - effectDrag.grabbed.offset.x}px, ${coordY - effectDrag.grabbed.offset.y}px)`
						dn.effect.style.transform = t
						dn.preview.style.transform = t
					}
					// republish so the proposal indicator (and trim) follow the new scroll position
					if(effectTrim.grabbed) {
						effectTrim.effect_dragover(ev.clientX, use.context.state)
					} else {
						effect_drag_over(ev)
					}
				}
			}
		}
		autoscroll_raf = requestAnimationFrame(autoscroll_tick)
	}

	const start_autoscroll = () => {
		if(autoscroll_raf === null) {autoscroll_raf = requestAnimationFrame(autoscroll_tick)}
	}

	const stop_autoscroll = () => {
		if(autoscroll_raf !== null) {cancelAnimationFrame(autoscroll_raf); autoscroll_raf = null}
		autoscroll_pointer = null
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
		// openimago-y8qw: ZERO-RE-RENDER tracking. The residual drag jank (after fttp/9oq0/pfho/
		// flat-clips) was the GRABBED clip's inner Effect view re-rendering ~58×/sec via setCords
		// — rebuilding its whole lit subtree + forcing style/layout/paint each pointermove. Move
		// the grabbed clip by a DIRECT imperative transform on its cached nodes here (composite-
		// only, like a plain div); the reactive setCords path is skipped for it (effect.ts). The
		// transform matches the reactive template (coordinates − grabbed.offset) so the committed
		// drop re-render lands without a jump; on drop effect.ts reconciles to the committed
		// resting transform (no sdin floating clip). The rAF below still drives the proposal
		// indicator + drop placement.
		const dn = effectDrag.directNodes
		if(dn && effectDrag.grabbed) {
			const bounds = get_timeline_bounds()
			if(bounds) {
				const coordX = Math.max(0, event.clientX - bounds.left)
				const coordY = Math.max(0, event.clientY - bounds.top)
				const t = `translate(${coordX - effectDrag.grabbed.offset.x}px, ${coordY - effectDrag.grabbed.offset.y}px)`
				dn.effect.style.transform = t
				dn.preview.style.transform = t
			}
		}
		// openimago-7ca2: start the drag-scoped frame monitor for clip/trim drags only.
		if(effectDrag.grabbed || effectTrim.grabbed) {start_frame_monitor()}
		// openimago-u7kw: track the latest pointer + run the edge auto-scroll loop during a
		// clip/trim drag (not playhead). The loop reads autoscroll_pointer every frame, so it
		// keeps scrolling even if the pointer is then held still at the edge.
		if(effectDrag.grabbed || effectTrim.grabbed) {
			autoscroll_pointer = event
			start_autoscroll()
		}
		pending_event = event
		if(raf_id === null) {raf_id = requestAnimationFrame(process_pending_dragover)}
	}

	const end_drag_interaction = () => {
		// openimago-fgec: this pointerup ends a real drag iff the DRAG monitor was running.
		// Capture before stop_frame_monitor() nulls frame_raf, then sample the post-drop
		// commit window (the previously-unmeasured drop hitch).
		const was_dragging = frame_raf !== null
		stop_frame_monitor() // openimago-7ca2: log the per-drag frame summary on drop.
		if(was_dragging) {start_commit_monitor()} // openimago-fgec: measure the commit window.
		stop_autoscroll() // openimago-u7kw: stop edge auto-scroll on pointerup/cancel.
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
			stop_frame_monitor() // openimago-7ca2
			if(commit_raf !== null) {cancelAnimationFrame(commit_raf); commit_raf = null} // openimago-fgec
			stop_autoscroll() // openimago-u7kw
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
