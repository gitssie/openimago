import {AnyEffect} from "../../../context/types.js"
import {laneHeight, LANE_GAP_PX} from "../../../../patches/timeline-lanes"

// Cumulative TOP (px) of a lane = sum of every preceding lane's height PLUS the
// 8px gap rendered below it (openimago-g1hb, docs/images/cut_panel.png). Per-lane
// height + gap come from the shared timeline-lanes source so the absolutely-
// positioned effects line up exactly with the block-flow track rows (which carry
// the matching height + margin-bottom) and the sidebar cells.
export function calculate_effect_track_placement(track_index: number, effects: AnyEffect[]) {
	let track_start = 0

	for (let i = 0; i < track_index; i++) {
		const track_effects = effects.filter(effect => effect.track === i)
		track_start += laneHeight(track_effects) + LANE_GAP_PX
	}

	return track_start
}
