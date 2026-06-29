import {css} from "@benev/slate"

const base_styles = css`
	.track {
		display: flex;
		position: relative;
		height: 50px;
		background: rgb(26, 26, 26);
		outline: 1px #111 solid;

		&[data-locked] {
			background: repeating-linear-gradient(45deg, #5D5D5D, #5D5D5D 10px, #858585 10px, #858585 20px);
			z-index: 10;
			opacity: 0.5;
		}

		&[data-hidden] {
			opacity: 0.2;
		}
	}

	.indicators {
		width: 100%;
		position: relative;

		& .indicator-area {
			position: absolute;
			width: 100%;
			height: 14px;
			top: -7px;
			z-index: 10;

			&[data-indicate] {
				cursor: grabbing;
			}
		}

		& .indicator {
			display: none;
			z-index: 1;
			position: relative;
			align-items: center;
			width: 100%;
			outline: 1px solid green;

			&[data-indicate] {
				display: flex;
				background: #0080002e;

			}
		}
	}
`

// ── Imago: empty-lane surface (openimago-g1hb). The empty NARRATION lane shows the
// bare .track background; docs/images/cut_panel.png samples it at rgb(39,39,39) — a
// touch lighter than 1.1.3's rgb(26,26,26). Retint flat to match. Appended after
// base_styles so it wins the cascade. ──
const imago_pass = css`
	.track {
		background: rgb(39, 39, 39);
	}
`

export const styles = css`
	${base_styles}
	${imago_pass}
`
