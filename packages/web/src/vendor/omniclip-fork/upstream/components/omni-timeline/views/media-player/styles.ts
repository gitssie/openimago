import {css} from "@benev/slate"

const base_styles = css`
	:host {}

	.flex {
		display: flex;
		justify-content: center;
		height: 100%;
		width: 100%;
		flex-direction: column;
	}

	.project-name {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5em;

		& .box {
			display: flex;
			align-items: center;
			border: 1px solid;
			border-radius: 10px;

			& .icons {
				display: flex;
				cursor: pointer;

				& .check {
					display: flex;
					color: green;
				}
			}

			& input {
				background: none;
				border: none;
				padding: 0.5em;
				color: gray;

				&:not(:disabled) {
					color: white;
				}
			}

			& svg {
				margin: 0.5em;
			}
		}
	}

	canvas {
		height: 100% !important;
		width: 100% !important;
	}

	.lower-canvas {
		background: rgb(32, 31, 31);
	}

	.canvas-container {
		position: relative;
		aspect-ratio: 16/9;
		height: 100%;
	}

	.upper-canvas {
		z-index: 100;
	}

	figure {
		position: relative;
		overflow: hidden;
		aspect-ratio: 16/9;
		display: flex;
		justify-content: center;
	}
	
	video {
		width: 100%;
	}

	.controls {
		display: flex;
		justify-content: center;
		width: 100%;
		margin: 0.5em 0;
		z-index: 999;

		& button {
			display: flex;
			align-items: center;
		}

		& .fs {
			position: absolute;
			right: 1em;
		}
	}

	.controls[data-state="hidden"] {
		display: none;
	}

	.controls[data-state="visible"] {
		display: block;
	}

	.controls > *:first-child {
		margin-left: 0;
	}

	.controls .progress {
		cursor: pointer;
		width: 75.390625%;
	}

	.controls button {
		border: none;
		cursor: pointer;
		background: transparent;
		background-size: contain;
		background-repeat: no-repeat;
		display: flex;
		justify-content: center;
	}

	.controls button:hover,
	.controls button:focus {
		opacity: 0.5;
	}

	.controls button[data-state="play"] {
		background-image: url("data:image/png;base64,iVBORw0KGgoAAA…");
	}

	.controls button[data-state="pause"] {
		background-image: url("data:image/png;base64,iVBORw0KGgoAAA…");
	}

	.controls progress {
		display: block;
		width: 100%;
		height: 81%;
		margin-top: 0.125rem;
		border: none;
		color: #0095dd;
		-moz-border-radius: 2px;
		-webkit-border-radius: 2px;
		border-radius: 2px;
	}

	.controls progress::-moz-progress-bar {
		background-color: #0095dd;
	}

	.controls progress::-webkit-progress-value {
		background-color: #0095dd;
	}
`

// ── Imago: portrait 9:16 preview + hide in-figure controls (openimago-wmns Pass A;
// folds media-player-styles.patch.ts). 1.1.3 hardcodes 16/9 on figure + .canvas-container;
// the playback transport moves to the combined control bar (Pass B), so the in-figure
// .controls overlay is hidden to avoid a duplicate. Appended after base_styles. ──
const imago_pass_a = css`
	figure {
		aspect-ratio: 9/16;
		min-height: 0;
		max-height: 100%;
		max-width: 100%;
		/* The .flex parent is column flex; default align-self:stretch would blow the
		   figure to full panel width and the 9:16 box would sit with wide dark side
		   gaps. Center it so width is derived from height × 9/16 (= the canvas width). */
		align-self: center;
		margin: 4px auto;
	}
	.canvas-container {
		aspect-ratio: 9/16;
	}
	/* Transport moves to the combined bar (Pass B) — hide the in-figure overlay so
	   play/fullscreen are not rendered twice. */
	.controls {
		display: none !important;
	}
`

export const styles = css`
	${base_styles}
	${imago_pass_a}
`
