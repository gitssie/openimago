import {css} from "@benev/slate"
import {GUTTER_PX} from "../../../../../patches/timeline-gutter"

// Flat-black 60px track-header gutter column (openimago-wmns Pass B.4). Width is the
// SINGLE source of truth GUTTER_PX (60), matched by the ruler-row spacer in the
// omni-timeline component so the ruler aligns with clip x-positions. The kind icon +
// volume/mute toggle stack vertically and centered in the 50px (or 30px text) lane.
export const styles = css`
	/* The TrackSidebar custom-element host is display:inline/width:auto by default, so it
	   sized to its content (~107px) and blew out the column. Pin the host to a GUTTER_PX
	   block so the .track-sidebars column is exactly the gutter width (openimago-wmns B.4). */
	:host {
		display: block;
		box-sizing: border-box;
		width: ${GUTTER_PX}px;
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

		& .items {
			display: flex;
			flex-direction: column;
			gap: 4px;
			align-items: center;
			justify-content: center;
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
