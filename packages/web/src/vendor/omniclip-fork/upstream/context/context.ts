import {AppCore, Pojo, Nexus, ZipAction, watch, signals} from "@benev/slate"
import {slate, Context, PanelSpec} from "@benev/construct/x/mini.js"

import {store} from "./controllers/store/store.js"
import {removeLoadingPageIndicator} from "../tools/remove-loading-page-indicator.js"
import {Media} from "./controllers/media/controller.js"
import {Timeline} from "./controllers/timeline/controller.js"
import {Shortcuts} from "./controllers/shortcuts/controller.js"
import {Compositor} from "./controllers/compositor/controller.js"
import {historical_state, non_historical_state} from "./state.js"
import {VideoExport} from "./controllers/video-export/controller.js"
import {HistoricalState, NonHistoricalState, State} from "./types.js"
import {historical_actions, non_historical_actions} from "./actions.js"
import {Collaboration} from "./controllers/collaboration/controller.js"
import {FFmpegHelper} from "./controllers/video-export/helpers/FFmpegHelper/helper.js"
import {StockLayouts} from "@benev/construct/x/context/controllers/layout/parts/utils/stock_layouts.js"
import {perfWrap, perfCount} from "../../patches/perf-diag" // openimago-7ca2 (DEV-only). REMOVE after diagnosis.

export interface MiniContextOptions {
	projectId: string
	panels: Pojo<PanelSpec>,
	layouts: StockLayouts
}

// init here to preserve collaboration state for client joining the room (joining refreshes context)
export const collaboration = new Collaboration()
let queue = Promise.resolve()

export class OmniContext extends Context {
	#non_historical_state = watch.stateTree<NonHistoricalState>(non_historical_state)
	#non_historical_actions = ZipAction.actualize(this.#non_historical_state, non_historical_actions)

	#store = store(localStorage)

	#listen_for_state_changes() {
		watch.track(() => this.#core.state, (state) => {
			perfCount("state-dispatch") // openimago-7ca2 (perf-diag; DEV-only). Fires once per historical-state dispatch — should NOT tick per frame during a drag. REMOVE after diagnosis.
			this.#save_to_storage(state)
			this.#updateAnimationTimeline(state)
			// openimago-pfho (BLOCKER B): with PIXI autoStart:false the shared ticker no
			// longer paints state-driven canvas mutations (text/style/transition/filter
			// property editors, clip add/move/trim/delete, BGM). Schedule ONE coalesced
			// render on the next frame — it runs AFTER the synchronous sprite mutation, so
			// the new value is painted. No-op at idle (no dispatch) and during playback
			// (#on_playing renders every frame), so it does NOT reintroduce the idle render.
			this.controllers.compositor.request_render()
		})
		// openimago-9oq0: COALESCE the effects/animations → animationManager.refresh →
		// compose_effects path. A ripple drop fires N SYNCHRONOUS effect dispatches
		// (effect-manager #pushEffectsForward forEach set_effect_start_position); the old
		// per-dispatch `queue.then(refresh)` ran a FULL refresh → compose_effects → 1080p
		// stage sort/render (+ a guarded seek) for EACH of the N — the "放置卡住" drop freeze.
		// Both watchers now schedule a single trailing-edge refresh, so the whole burst
		// collapses to ONE refresh + ONE compose on the FINAL state (identical visual result).
		watch.track(() => this.#core.state.effects, () => this.#scheduleEffectsRefresh())
		watch.track(() => this.#core.state.animations, () => this.#scheduleEffectsRefresh())
	}

	#refreshScheduled = false

	// openimago-9oq0: trailing-edge coalesce of animationManager.refresh. The first dispatch
	// of a synchronous burst schedules ONE rAF; later dispatches in the same tick are deduped.
	// On the next frame the refresh runs ONCE, reading the FINAL `this.state`, so the last
	// update is never dropped. Mirrors the openimago-pfho request_render rAF-coalesce pattern.
	// Keeps the existing `queue` serialisation so an in-flight async refresh never overlaps.
	#scheduleEffectsRefresh() {
		if(this.#refreshScheduled) {return}
		this.#refreshScheduled = true
		requestAnimationFrame(() => {
			this.#refreshScheduled = false
			queue = queue.then(async () => {
				await this.controllers.compositor.managers.animationManager.refresh(this.state)
			})
		})
	}

	// DISABLED — omniclip's localStorage self-persistence is a NO-OP in the imago
	// fork (openimago-v6m6). Ownership model A: cut.json is the single source of
	// truth, we clear omniclip's localStorage on boot (clear-omni-persistence.ts) and
	// re-hydrate from cut.json on every mount — so persisting omniclip's own state is
	// both unwanted AND the source of a console-spamming crash: this wrote to the
	// json_storage_proxy on EVERY state mutation (~42x per hydrate), and its set trap
	// returns false when JSON.stringify/setItem throws (localStorage quota / a
	// non-serializable value), which a Proxy set returning falsish turns into a
	// strict-mode TypeError. Not writing at all removes the throw entirely.
	// Undo/redo is unaffected (it replays the in-memory historical_state, not
	// localStorage); #updateAnimationTimeline still runs from #listen_for_state_changes.
	#save_to_storage(_state: HistoricalState) {
		return
	}

	#updateAnimationTimeline(state: HistoricalState) {
		// openimago-7ca2: time the Math.max-over-all-effects this runs on every dispatch
		// (perfWrap records both ms and call count). REMOVE after diagnosis.
		perfWrap("updateAnimationTimeline", () => {
			const timelineDuration = Math.max(...state.effects.map(effect => effect.start_at_position + (effect.end - effect.start)))
			this.controllers.compositor.managers.animationManager.updateTimelineDuration(timelineDuration)
			this.controllers.compositor.managers.transitionManager.updateTimelineDuration(timelineDuration)
		})
	}

	#state_from_storage(projectId: string): HistoricalState {
		return this.#store[projectId]
	}

	// state tree with history
	#core: AppCore<HistoricalState, typeof historical_actions>

	get state(): State {
		return {...this.#non_historical_state.state, ...this.#core.state}
	}

	get actions() {
		return {
			...this.#non_historical_actions,
			...this.#core?.actions
		}
	}

	undo() {
		this.#core.history.undo()
		this.controllers.compositor.update_canvas_objects(this.state)
	}

	redo() {
		this.#core.history.redo()
		this.controllers.compositor.update_canvas_objects(this.state)
	}

	clear_project(omit?: boolean) {
		this.actions.clear_project({omit})
		this.actions.remove_all_effects({omit})
		this.actions.remove_tracks({omit})
		this.controllers.compositor.clear(omit)
	}

	get history() {
		return this.#core.history.annals
	}

	helpers = {
		ffmpeg: new FFmpegHelper(this.actions)
	}

	is_webcodecs_supported = signals.op<any>()

	controllers: {
		timeline: Timeline,
		compositor: Compositor
		media: Media
		video_export: VideoExport
		shortcuts: Shortcuts
		collaboration: Collaboration
	}

	#check_if_webcodecs_supported() {
		if(!window.VideoEncoder && !window.VideoDecoder) {
			this.is_webcodecs_supported.setError("webcodecs-not-supported")
		} else {
			this.is_webcodecs_supported.setReady(true)
		}
	}
	
	//after loading state from localstorage, compositor objects must be recreated
	#recreate_project_from_localstorage_state(state: State, media: Media) {
		this.controllers.compositor.recreate(state, media)
	}

	constructor(options: MiniContextOptions) {
		super(options)
		this.drops.editor.dragover = () => {}
		this.#core = new AppCore({
			initial_state: this.#state_from_storage(options.projectId) ?? {...historical_state, projectId: options.projectId},
			history_limit: 64,
			actions_blueprint: ZipAction.blueprint<HistoricalState>()(historical_actions)
		})
		this.#check_if_webcodecs_supported()
		const compositor = new Compositor(this.actions)
		const media = new Media()
		this.controllers = {
			compositor,
			media,
			timeline: new Timeline(this.actions, media, compositor),
			video_export: new VideoExport(this.actions, compositor, media),
			shortcuts: new Shortcuts(this, this.actions),
			collaboration
		}
		this.#listen_for_state_changes()
		this.#recreate_project_from_localstorage_state(this.state, this.controllers.media)
		removeLoadingPageIndicator()
	}
}

export const omnislate = slate as Nexus<OmniContext>
export const {shadow_component, shadow_view, light_view, light_component} = omnislate
