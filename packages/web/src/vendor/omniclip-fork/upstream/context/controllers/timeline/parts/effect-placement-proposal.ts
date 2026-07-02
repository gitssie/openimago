import {EffectDrag} from "./drag-related/effect-drag.js"
import {EffectPlacementUtilities} from "./effect-placement-utilities.js"
import {AnyEffect, EffectTimecode, ProposedTimecode, State} from "../../../types.js"

// EffectPlacementProposal: Calculates proposed positions for effects on the timeline
export class EffectPlacementProposal {
	#placementUtilities = new EffectPlacementUtilities()

	calculateProposedTimecode(effectTimecode: EffectTimecode, {grabbed, position}: EffectDrag, state: State): ProposedTimecode {
		const effectsToConsider = this.#excludeGrabbedEffect(grabbed.effect.id, state.effects)
		const trackEffects = effectsToConsider.filter(effect => effect.track === effectTimecode.track)

		const effectBefore = this.#placementUtilities.getEffectsBefore(trackEffects, effectTimecode.timeline_start)[0]
		const effectAfter = this.#placementUtilities.getEffectsAfter(trackEffects, effectTimecode.timeline_start)[0]
		const grabbedEffectLength = effectTimecode.timeline_end - effectTimecode.timeline_start

		let proposedStartPosition = effectTimecode.timeline_start
		let shrinkedSize: number | null = null
		let effectsToPushForward: AnyEffect[] | null = null

		if (effectBefore && effectAfter) {
			const spaceBetween = this.#placementUtilities.calculateSpaceBetween(effectBefore, effectAfter)
			if (spaceBetween < grabbedEffectLength && spaceBetween > 0) {
				shrinkedSize = spaceBetween
			} else if (spaceBetween === 0) {
				effectsToPushForward = this.#placementUtilities.getEffectsAfter(trackEffects, effectTimecode.timeline_start)
			}
		}

		// openimago-pos0: when there is no clip before the drop position (effectBefore
		// is null, e.g. dropping at position 0 or at the very start of the track) but
		// the proposed clip would overlap an existing clip at or after timeline_start,
		// push those clips forward instead of letting #adjustStartPosition move the
		// grabbed clip backwards to a negative / wrong position.
		// The push-forward branch inside "if (effectBefore && effectAfter)" is not
		// reached when effectBefore is undefined, so we handle it explicitly here.
		// (effectAfter is now found via >= in getEffectsAfter, so a clip sitting at
		// exactly timeline_start = 0 is visible.)
		if (!effectBefore && effectAfter) {
			const distanceToAfter = this.#placementUtilities.calculateDistanceToAfter(effectAfter, effectTimecode.timeline_end)
			if (distanceToAfter < 0) {
				effectsToPushForward = this.#placementUtilities.getEffectsAfter(trackEffects, effectTimecode.timeline_start)
			}
		}

		proposedStartPosition = this.#adjustStartPosition(
			effectBefore,
			effectAfter,
			proposedStartPosition,
			effectTimecode.timeline_end,
			grabbedEffectLength,
			effectsToPushForward,
			shrinkedSize
		)

		if(position.indicator?.type === "addTrack") {
			return {
				proposed_place: {
					start_at_position: this.#placementUtilities.roundToNearestFrame(effectTimecode.timeline_start, state.timebase),
					track: effectTimecode.track
				},
				duration: grabbed.effect.end - grabbed.effect.start,
				effects_to_push: []
			}
		}

		return {
			proposed_place: {
				start_at_position: this.#placementUtilities.roundToNearestFrame(proposedStartPosition, state.timebase),
				track: effectTimecode.track
			},
			duration: shrinkedSize,
			effects_to_push: effectsToPushForward
		}
	}

	#adjustStartPosition(
		effectBefore: AnyEffect | undefined,
		effectAfter: AnyEffect | undefined,
		startPosition: number,
		timelineEnd: number,
		grabbedEffectLength: number,
		pushEffectsForward: AnyEffect[] | null,
		shrinkedSize: number | null
	) {
		if (effectBefore) {
			const distanceToBefore = this.#placementUtilities.calculateDistanceToBefore(effectBefore, startPosition)
			if (distanceToBefore < 0) {
				startPosition = effectBefore.start_at_position + (effectBefore.end - effectBefore.start)
			}
		}

		if (effectAfter) {
			const distanceToAfter = this.#placementUtilities.calculateDistanceToAfter(effectAfter, timelineEnd)
			if (distanceToAfter < 0) {
				startPosition = pushEffectsForward
					? effectAfter.start_at_position
					: shrinkedSize
						? effectAfter.start_at_position - shrinkedSize
						: effectAfter.start_at_position - grabbedEffectLength
			}
		}

		return startPosition
	}

	#excludeGrabbedEffect(grabbedEffectId: string, effects: AnyEffect[]) {
		return effects.filter(effect => effect.id !== grabbedEffectId)
	}

}
