import {css} from "@benev/slate"

const base_styles = css`
	:host {
		width: 100%;
	}

	.time-ruler {
		font-size: 0.5em;
		display: flex;
		height: 20px;
		background: rgb(26, 26, 26);
		align-items: center;
	}

	.indicator {
		pointer-events: none;
		z-index: 10;
		width: 1px;
		height: 100%;
		background: yellow;
	}

	.time {
		position: absolute;
		pointer-events: none;
	}

	.dot {
		width: 3px;
		height: 3px;
		background: gray;
		border-radius: 5px;
	}

	.content {
		position: relative;
		right: 50%;
	}
`

// ── Imago: flat-black ruler (openimago-wmns Pass B.5). The ruler↔clip ALIGNMENT is
// already handled structurally by the 60px ruler-row spacer (Pass B.4) — the native
// ruler measures seek from .timeline-relative, so NO gutter offset is folded (the 1.0.7
// time-ruler-view.patch's GUTTER_PX subtraction would double-correct). Only the colors
// are retinted to match the flat-black theme: the seek indicator goes yellow→white (like
// the playhead) and the strip background goes rgb(26,26,26)→deep flat-black. ──
const imago_pass_b = css`
	.time-ruler {
		background: var(--imago-bg-deep, #0a0a0f);
	}
	.indicator {
		background: var(--imago-text-primary, #fff);
	}
`

export const styles = css`
	${base_styles}
	${imago_pass_b}
`
