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

	// openimago-y8qw: the grabbed clip's real DOM nodes (.effect + sibling .trim-handles),
	// cached at drag start by effect.ts. While grabbed, component.ts writes their transform
	// DIRECTLY + synchronously per pointermove (zero-latency, no per-frame reactive re-render
	// of the inner Effect view — the ~58/s effect-inner-render that was the residual jank).
	// On drop, effect.ts reconciles them to the COMMITTED resting transform (microtask) and
	// nulls this, so the clip lands contiguous (no sdin floating-clip regression).
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
		// openimago-y8qw: null the cached nodes. effect.ts's onDrop handler runs DURING the
		// preceding onDrop.publish() (before this), captures the refs into a local, and
		// reconciles their transform to the committed resting position in a microtask — so
		// nulling here is safe and the clip still lands contiguous.
		this.directNodes = null
		this.grabbed = null
		this.#isGrabbed = false
		this.at = null
	}
}
