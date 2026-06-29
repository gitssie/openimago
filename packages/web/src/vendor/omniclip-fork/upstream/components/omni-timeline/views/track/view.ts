import {html} from "@benev/slate"

import {styles} from "./styles.js"
import {shadow_view} from "../../../../context/context.js"
import {AddTrackIndicator} from "../indicators/add-track-indicator.js"
import {laneHeight, LANE_GAP_PX} from "../../../../../patches/timeline-lanes"
import {getEffectsOnTrack} from "../../../../context/controllers/timeline/utils/get-effects-on-track.js"

export const Track = shadow_view(use => (index :number) => {
	use.styles(styles)
	const track_effects = getEffectsOnTrack(use.context.state, index)
	const isLocked = use.context.state.tracks.find((t, i) => i === index)?.locked
	const isVisible = use.context.state.tracks.find((t, i) => i === index)?.visible

	// Per-lane height + the 8px gap below the row (openimago-g1hb): the video lane is
	// tall, the empty narration + BGM lanes short. margin-bottom renders the gap in
	// block flow exactly where calculate_effect_track_placement adds it to the
	// absolute effect tops, so rows and clips stay aligned.
	const lane_height = laneHeight(track_effects)

	return html`
		<div ?data-hidden=${!isVisible} ?data-locked=${isLocked} style="height: ${lane_height}px; margin-bottom: ${LANE_GAP_PX}px;" class=track></div>
		<div class="indicators">
			${AddTrackIndicator(index)}
		</div>
	`
})
