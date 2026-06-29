import {GoldElement, html} from "@benev/slate"

import {styles} from "./styles.js"
import {shadow_view} from "../../../../context/context.js"
import scissorsSvg from "../../../../icons/gravity-ui/scissors.svg.js"
import undoSvg from "../../../../icons/material-design-icons/undo.svg.js"
import redoSvg from "../../../../icons/material-design-icons/redo.svg.js"
import playSvg from "../../../../icons/gravity-ui/play.svg.js"
import pauseSvg from "../../../../icons/gravity-ui/pause.svg.js"
import fullscreenSvg from "../../../../icons/gravity-ui/fullscreen.svg.js"
import zoomInSvg from "../../../../icons/material-design-icons/zoom-in.svg.js"
import zoomOutSvg from "../../../../icons/material-design-icons/zoom-out.svg.js"
// Pure timecode + zoom-step helpers (tested in src/utils/cut/*); the view stays thin.
import {totalDurationMs, formatTimecodeMs} from "src/utils/cut/toolbar-timecode"
import {zoomSteps} from "src/utils/cut/cut-controls"

// Single combined CapCut-style control bar (openimago-4qwj; folded into the vendored
// toolbar in openimago-wmns Pass B.3, replacing toolbar.patch.ts's resolveId redirect).
//
// The approved design (docs/images/cut_panel.png) is ONE bar that merges the playback
// TRANSPORT (current/total time + play/pause) with the timeline TOOLBAR (history, split,
// mute, fullscreen, zoom). 1.1.3's native toolbar is the timeline-side row only and the
// transport lives in the media-player's in-figure .controls overlay (hidden by the Pass A
// media-player fold). We OWN this view and render the transport here too, driven by the
// SAME global omnislate context (compositor.toggle_video_playing, state.is_playing).
//
// ACTIONS PRESERVED (no functionality dropped): undo/redo (history), split, zoom in/out,
// plus the added transport, master-mute, fullscreen. (remove-selected / clear-project are
// omitted to match the approved combined design; delete still works via the clip menu +
// the edit-diff pipeline.)
//
// HONEST controls — every affordance is real:
//   • MASTER MUTE: 1.1.3 has no native mute API. We set `.muted` on every preview
//     HTMLMediaElement — the audioManager Map (id → <audio>) and, for video, the <video>
//     backing each pixi sprite's VideoResource (sprite.texture.baseTexture.resource.source;
//     1.1.3 is pixi, NOT fabric.getElement()). Re-applied on the compositor on_playing rAF
//     tick so it persists as clips start/swap.
//   • ZOOM SLIDER: 1.1.3 exposes only zoom_in/zoom_out (±0.1), no set_zoom, so the slider
//     reaches its target by calling those REACTIVE actions the right number of steps (pure
//     zoomSteps) — the only route that recomputes the ruler ticks + clip widths.
//   • FULLSCREEN: requests it on the editor host (best-effort), else the page.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

// Zoom slider bounds mirror the +/- button clamps + the zoom_in/zoom_out delta.
const ZOOM_MIN = -13
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

export const Toolbar = shadow_view(use => (_timeline: GoldElement) => {
	use.styles(styles)
	use.watch(() => use.context.state)
	const actions = use.context.actions
	const state = use.context.state
	const zoom = state.zoom
	const controller = use.context.controllers.timeline
	const compositor = use.context.controllers.compositor

	// ── Master mute (real global mute; 1.1.3 has no native API) ──────────────
	const [muted, setMuted] = use.state(false)

	const applyMute = (flag: boolean) => {
		const managers = compositor?.managers
		if (!managers) return
		for (const el of managers.audioManager.values()) {
			if (el instanceof HTMLMediaElement) el.muted = flag
		}
		// 1.1.3 pixi: the <video> backs the sprite's VideoResource (not fabric getElement()).
		for (const obj of managers.videoManager.values() as Iterable<{
			sprite?: {texture?: {baseTexture?: {resource?: {source?: unknown}}}}
		}>) {
			const el = obj?.sprite?.texture?.baseTexture?.resource?.source
			if (el instanceof HTMLMediaElement) el.muted = flag
		}
	}

	const toggleMute = () => {
		const next = !muted
		setMuted(next)
		applyMute(next)
	}

	use.mount(() => {
		// Re-apply mute every rAF tick while playing so it persists as clips start/swap.
		const unsubPlaying = compositor?.on_playing?.(() => applyMute(muted))
		return () => { unsubPlaying?.() }
	})

	// Drive the slider's target zoom through the REACTIVE zoom_in/zoom_out actions (no
	// set_zoom exists) so the ruler + clip widths recompute live.
	const onZoomSlider = (event: Event) => {
		const target = Number((event.target as HTMLInputElement).value)
		if (!Number.isFinite(target)) return
		const plan = zoomSteps(state.zoom, target, ZOOM_STEP)
		if (plan.direction === "none") return
		const step = plan.direction === "in" ? actions.zoom_in : actions.zoom_out
		for (let i = 0; i < plan.count; i++) step()
	}

	const total = totalDurationMs(state.effects)

	// Fullscreen the editor host (best-effort, no slate-internal deps), else the page.
	const toggleFullscreen = () => {
		if (document.fullscreenElement) { document.exitFullscreen?.(); return }
		const el = (use as {element?: HTMLElement}).element
		const root = el?.getRootNode?.() as ShadowRoot | Document | null
		const host = root && "host" in root ? (root as ShadowRoot).host as HTMLElement : null
		const target = (host?.closest?.("construct-editor") as HTMLElement | null) ?? document.documentElement
		target.requestFullscreen?.()
	}

	return html`
		<div class="toolbar">
			<div class=tools>
				<!-- LEFT: history (undo/redo) + split. -->
				<div class=flex>
					<div class=history>
						<button
							?disabled=${use.context.history.past.length === 0}
							?data-past=${use.context.history.past.length !== 0}
							aria-label="撤销"
							@click=${() => { use.context.undo(); use.rerender() }}
						>${undoSvg}</button>
						<button
							?disabled=${use.context.history.future.length === 0}
							?data-future=${use.context.history.future.length !== 0}
							aria-label="重做"
							@click=${() => { use.context.redo(); use.rerender() }}
						>${redoSvg}</button>
					</div>
					<button class="split" aria-label="分割" @click=${() => controller.split(use.context.state)}>${scissorsSvg}</button>
				</div>

				<!-- CENTER: current-time · play/pause · total-time. -->
				<div class="transport" role="group" aria-label="播放控制">
					<span class="current" aria-label="当前时间">${formatTimecodeMs(state.timecode)}</span>
					<button
						class="playpause"
						aria-label=${state.is_playing ? "暂停" : "播放"}
						data-state="${state.is_playing ? "pause" : "play"}"
						@click=${compositor.toggle_video_playing}
					>${state.is_playing ? pauseSvg : playSvg}</button>
					<span class="total" aria-label="总时长">${formatTimecodeMs(total)}</span>
				</div>

				<!-- RIGHT: master-mute · fullscreen · zoom-out · slider · zoom-in. -->
				<div class="right">
					<button
						class="mute"
						aria-label=${muted ? "取消静音" : "静音"}
						aria-pressed=${muted ? "true" : "false"}
						data-muted=${muted ? "true" : "false"}
						@click=${toggleMute}
					>
						${muted
							? html`
								<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
									<path d="M3 9v6h4l5 5V4L7 9H3z" />
									<path d="M16 9l4 4m0-4l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
								</svg>`
							: html`
								<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
									<path d="M3 9v6h4l5 5V4L7 9H3z" />
									<path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
								</svg>`}
					</button>
					<button class="fs" aria-label="全屏" @click=${toggleFullscreen}>${fullscreenSvg}</button>
					<div class="zoom">
						<button ?disabled=${zoom <= ZOOM_MIN} @click=${actions.zoom_out} class="zoom-out" aria-label="缩小">${zoomOutSvg}</button>
						<input
							class="zoom-slider"
							type="range"
							min=${ZOOM_MIN}
							max=${ZOOM_MAX}
							step=${ZOOM_STEP}
							.value=${String(zoom)}
							aria-label="缩放时间轴"
							@input=${onZoomSlider}
						/>
						<button ?disabled=${zoom >= ZOOM_MAX} @click=${actions.zoom_in} class="zoom-in" aria-label="放大">${zoomInSvg}</button>
					</div>
				</div>
			</div>
		</div>
	`
})
