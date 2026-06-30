import {pub} from "@benev/slate"
import {At, Grabbed} from "../../../../types.js"

export interface EffectDrop {
	grabbed: Grabbed
	position: At
}

export interface EffectDrag {
	grabbed: Grabbed
	position: At
}

export class EffectDragHandler {
	at: At | null = null
	grabbed: null | Grabbed = null
	#isGrabbed = false
	onEffectDrag = pub<EffectDrag>()
	onDrop = pub<EffectDrop>()

	// openimago-sdin: the grabbed clip's real DOM nodes (.effect + its sibling .trim-handles
	// preview), cached at drag start by effect.ts. While grabbed, component.ts writes their
	// transform DIRECTLY + SYNCHRONOUSLY on each pointermove (zero-latency tracking),
	// bypassing the rAF coalescing + reactive setCords round-trip. Cleared on drop so the
	// reactive render owns final placement.
	directNodes: {effect: HTMLElement; preview: HTMLElement} | null = null

	move(position: At) {
		if (this.#isGrabbed && this.grabbed) {
			this.onEffectDrag.publish({ position, grabbed: this.grabbed })
			this.at = position
		}
	}

	start(grabbed: Grabbed, at: At) {
		this.#isGrabbed = true
		this.grabbed = grabbed
		this.at = at
	}

	drop(e: PointerEvent) {
		if(this.grabbed) {
			// openimago-5zry: the Cut editor is a FIXED 3-lane layout — a drop must
			// NEVER create a new lane. The "addTrack" indicator (set when the drop
			// lands on an `.indicator-area` gutter) is what drives
			// EffectManager.setProposedTimecode -> #adjustForAddTrackDrop ->
			// actions.add_track(), so it is suppressed here: the committed drop
			// always carries a null indicator and the fixed 3-lane set is preserved.
			void e
			this.onDrop.publish({grabbed: this.grabbed!, position: {...this.at!, indicator: null}})
			this.#resetState()
		}
	}

	end() {
		if(this.grabbed) {
			this.onDrop.publish({grabbed: this.grabbed!, position: this.at!})
			this.#resetState()
		}
	}

	#resetState() {
		// openimago-sdin: drop the cached node refs. We do NOT manually clear their inline
		// transform here — the grabbed Effect view re-renders on drop (setCords([null,null])
		// + the committed start_at_position), and lit's style-attribute write atomically
		// REPLACES the inline transform with the final placement, so there is no
		// double-offset jump or flash. (Clearing it here would briefly revert to the OLD
		// resting position before that re-render applies.)
		this.directNodes = null
		this.grabbed = null
		this.#isGrabbed = false
		this.at = null
	}
}
