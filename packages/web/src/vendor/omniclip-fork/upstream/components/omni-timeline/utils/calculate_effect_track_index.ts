import {AnyEffect} from "../../../context/types.js"
import {laneHeight, LANE_GAP_PX} from "../../../../patches/timeline-lanes"

// Inverse of calculate_effect_track_placement: map a pointer y back to a lane
// index using the SAME per-lane heights + 8px gaps (openimago-g1hb) so a drag
// proposal lands on the lane the cursor is actually over. A y inside a gap rolls
// to the next lane; a y past the last lane returns number_of_tracks (new lane).
export function calculate_effect_track_index(y: number, number_of_tracks: number, effects: AnyEffect[]) {
	let acc = 0

	for (let i = 0; i < number_of_tracks; i++) {
		const track_effects = effects.filter(effect => effect.track === i)
		const trackHeight = laneHeight(track_effects)

		if (acc + trackHeight >= y) {
			return i
		}

		acc += trackHeight + LANE_GAP_PX
	}

	return number_of_tracks
}
