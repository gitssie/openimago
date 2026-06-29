import {css} from "@benev/slate"

const base_styles = css`
	.playhead {
		position: absolute;
		display: flex;
		justify-content: center;
		width: 2px;
		height: 100%;
		background: var(--alpha);
		z-index: 15;
		cursor: pointer;
		touch-action: none;

		& > * {
			touch-action: none;
		}

		& .head {
			transform: rotate(180deg);
			height: 8px;
			width: 16px;
			top: 5px;
			color: var(--alpha);
			position: absolute;
		}
	}

`

// ── Imago: white playhead (openimago-wmns Pass A; folds playhead-styles.patch.ts).
// 1.1.3 colors the line + arrow via var(--alpha) (a construct accent); override to flat
// white. Appended after base_styles so it wins the cascade. ──
const imago_pass_a = css`
	.playhead {
		background: var(--imago-text-primary, #fff);
	}
	.playhead .head {
		color: var(--imago-text-primary, #fff);
	}
`

export const styles = css`
	${base_styles}
	${imago_pass_a}
`
