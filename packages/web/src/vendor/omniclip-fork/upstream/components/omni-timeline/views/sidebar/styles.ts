import {css} from "@benev/slate"
import {GUTTER_PX} from "../../../../../patches/timeline-gutter"
import {LANE_GAP_PX} from "../../../../../patches/timeline-lanes"

// Flat-black 60px track-header gutter column (openimago-wmns Pass B.4). Width is the
// SINGLE source of truth GUTTER_PX (60), matched by the ruler-row spacer in the
// omni-timeline component so the ruler aligns with clip x-positions. The kind icon +
// volume/mute toggle stack vertically and centered in the per-lane height (the
// .switches height mirrors the track row, openimago-g1hb).
export const styles = css`
	/* The TrackSidebar custom-element host is display:inline/width:auto by default, so it
	   sized to its content (~107px) and blew out the column. Pin the host to a GUTTER_PX
	   block so the .track-sidebars column is exactly the gutter width (openimago-wmns B.4).
	   margin-bottom renders the 8px inter-lane gap so each gutter cell stays row-aligned
	   with its (now variable-height) track row (openimago-g1hb). */
	:host {
		display: block;
		box-sizing: border-box;
		width: ${GUTTER_PX}px;
		margin-bottom: ${LANE_GAP_PX}px;
	}

	.switches {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: ${GUTTER_PX}px;
		background: var(--imago-bg-deep, #0a0a0f);
		border-right: 1px solid var(--imago-border-soft, rgba(255, 255, 255, 0.06));
		color: var(--imago-text-muted, #989898);

		/* Icons sit side-by-side: kind icon LEFT, volume RIGHT (docs/images/cut_panel.png),
		   spread by space-between with a small inset. A row (not the old vertical column)
		   keeps both glyphs inside the now-short 25px audio lanes, and a lone kind icon
		   (the empty narration lane, no volume) stays left-aligned under the others. */
		& .items {
			display: flex;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: 6px;
			width: 100%;
			padding: 0 9px;
			box-sizing: border-box;
		}

		& .kind-icon {
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--imago-text-muted, #989898);
		}

		& .kind-icon svg {
			width: 16px;
			height: 16px;
			display: block;
		}

		& button {
			display: flex;
			align-items: center;
			justify-content: center;
			background: transparent;
			border: none;
			padding: 0;
			cursor: pointer;
			color: var(--imago-text-faint, #6a6a6a);

			/* Muted reads as the theme pink (an "off" warning), matching the toolbar mute. */
			&[data-active] {
				color: var(--imago-neon-pink, #f13131);
			}

			&:hover {
				color: var(--imago-text-primary, #fff);
			}

			& svg {
				width: 14px;
				height: 14px;
				display: block;
			}
		}
	}
`
