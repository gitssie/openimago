import {css} from "@benev/slate"

const base_styles = css`

	::part(scroll) {
		overflow-x: visible;
		overflow-y: visible;
	}

	.trim-handles {
		cursor: grab;
		position: absolute;
		top: 0;
		z-index: 1;
		height: 50px;
		border: 1px solid #111;
		border-radius: 5px;

		&[data-no-file] {
			border: 3px dotted red;
			color: red;
		}

		&[data-grabbed] {
			opacity: 1 !important;
			cursor: grabbing;
			/* openimago-6807: the .trim-handles preview is the element effect.ts moves via
			   transform:translate(setCords) during a drag — promote it to its own layer
			   (composite-only move) and contain its paint. Gated on [data-grabbed] so the
			   layer exists only while dragging. */
			will-change: transform;
			contain: paint;
		}

		&[data-selected] {
			z-index: 5;
			mix-blend-mode: overlay;
			background: rgb(255,255,255,0.8);
			touch-action: none;

			& .trim-handle-right, .trim-handle-left {
				filter: drop-shadow(2px 4px 6px black);
				background: white;
				display: flex;
				z-index: 3;
				align-items: center;
				justify-content: center;
				gap: 3px;
				position: absolute;
				width: 18px;
				height: 100%;
				cursor: e-resize;

				& .line {
					opacity: 0.7;
					width: 3px;
					height: 40%;
					background: #333;
					border-radius: 5px;
				}
			}
		}

		& .trim-handle-left {
			left: 0;
			z-index: 3;
			border-top-left-radius: 5px;
			border-bottom-left-radius: 5px;
		}

		& .trim-handle-right {
			right: 0;
			z-index: 3;
			border-top-right-radius: 5px;
			border-bottom-right-radius: 5px;
		}
	}

	.effect {
		display: flex;
		z-index: 1;
		align-items: center;
		background: #201f1f;
		border-radius: 5px;
		border: 1px solid #111;
		cursor: grab;
		position: absolute;
		top: 0;
		height: 50px;
		overflow: hidden;
		/* openimago-6807: cap each clip's paint/layout area. Clips can be many
		   thousands of px wide with a tiled repeat-x filmstrip; bounding the clip's
		   paint + layout lets the browser skip re-rasterising off-screen clips and the
		   ones pushed during a swap. Visually a no-op — the box is already
		   overflow:hidden + position:absolute (its own containing block), and the
		   .trim-handles live in a SIBLING node so they are never clipped by this. */
		contain: layout paint;

		& .not-found {
			background: repeating-linear-gradient(45deg, #5D5D5D, #5D5D5D 10px, #858585 10px, #858585 20px);
			position: absolute;
			height: 100%;
		}

		&[data-grabbed] {
			z-index: 2;
			opacity: 0.5 !important;
			/* openimago-6807: promote the GRABBED clip to its own GPU compositor layer
			   so the per-frame transform:translate move (effect.ts setCords) is
			   composite-only — no re-rasterising of the huge tiled filmstrip each frame.
			   Gated on [data-grabbed] so the layer (and its GPU memory) exists ONLY for
			   the duration of the drag, never for all clips at once. */
			will-change: transform;
		}

		&[data-selected] {
			filter: brightness(0.5);
		}

		&[data-hidden] {
			opacity: 0.2;
		}

		&[data-selected]::after {
			outline: 2px solid white;
			outline-offset: -2px;
			content: "";
			position: absolute;
			width: 100%;
			height: 100%;
			border-radius: 5px;
			box-shadow: inset 0px 0px 6px 2px black;
		}

		& .no-file {
			margin: 0.2em;
			color: white;
			text-shadow: 0px 0px 5px black;
		}

		& .proxy {
			position: absolute;
			z-index: 10;
			top: 0;

			& svg {
				color: linear-gradient(180deg, #ffd275 0%, #f3b737 100%);
			}
		}

		& .progress {
			position: absolute;
			background: linear-gradient(180deg, #ffd275 0%, #f3b737 100%);
			width: 100%;
			bottom: 0;
		}

		& .progress-float {
			position: relative;
			z-index: 10;
			text-shadow: 0px 0px 5px black;
			color: white;
			font-family: Nippo-Regular;
			margin: 0.2em;
		}

		&:hover {
			border: 1px solid white;
		}
	}
`

// ── Imago flat-black clip styling (openimago-wmns Pass A; folds effect-styles.patch.ts,
// adapted to 1.1.3's effects/parts/styles.ts DOM). Appended after base_styles so the
// equal/higher-specificity rules win the cascade. Tokens cross the shadow boundary from
// applyImagoTheme; fallbacks reproduce a sane default for an un-themed mount. ──
const imago_pass_a = css`
	/* Flat clip fill + soft border (was #201f1f / 1px #111). */
	.effect {
		background: var(--imago-bg-surface, #201f1f);
		border: 1px solid var(--imago-border-soft, transparent);
		border-radius: var(--imago-radius-md, 5px);
	}

	/* Selected clip → FLAT: 1.1.3 darkens it (filter:brightness(.5)), whitens it
	   (.trim-handles[data-selected] white overlay) and draws a 2px white ::after ring
	   with an inset black shadow. Approved look = a single thin 1px cyan border, no
	   darkening, no halo. Neutralize all three affordances. */
	.effect[data-selected] {
		filter: none;
	}
	.effect[data-selected]::after {
		outline: 1px solid var(--imago-neon-cyan, #00f0ff);
		outline-offset: -1px;
		box-shadow: none;
		border-radius: var(--imago-radius-md, 5px);
	}
	.trim-handles[data-selected] {
		background: transparent;
		mix-blend-mode: normal;
	}

	/* Hover: subtle cyan instead of solid white. */
	.effect:hover {
		border: 1px solid var(--imago-border-cyan, rgba(0, 240, 255, 0.35));
	}

	/* Orphan / missing-source → theme pink (1.1.3 puts data-no-file on .trim-handles). */
	.trim-handles[data-no-file] {
		border: 2px dotted var(--imago-neon-pink, #ff2d95);
		color: var(--imago-neon-pink, #ff2d95);
	}

	/* Clean clips: hide the grey grab/trim grip (18px white box + #333 .line bars).
	   Trimming still works by dragging the edge; the edit pipeline derives trim from the
	   effect-state diff, not these nodes. */
	.trim-handle-left,
	.trim-handle-right,
	.trim-handles[data-selected] .trim-handle-left,
	.trim-handles[data-selected] .trim-handle-right {
		display: none;
	}

	/* BGM lane stays flat. The audio effect carries data-audio on BOTH its .effect and
	   its sibling .trim-handles (parts/effect.ts) — a reliable hook (no :has()/sibling-
	   combinator fragility) for the short 25px lane (openimago-g1hb). The bar fills the
	   lane, so the clip's selection chrome must NOT draw a taller box or a line below it:
	   - kill the full-box ::after ring + hover outline on the bar,
	   - neutralize the .trim-handles box entirely (transparent, no border, no washout) so
	     nothing extends into the gap below the bar (it stays a click target for select),
	   - never let 1.1.3's selected brightness/white-overlay wash the green out. */
	.effect[data-audio]::after {
		display: none;
	}
	.effect[data-audio]:hover {
		outline: none;
		border-color: var(--imago-border-soft, transparent);
	}
	.effect[data-audio],
	.effect[data-audio][data-selected] {
		filter: none;
	}
	.trim-handles[data-audio],
	.trim-handles[data-audio][data-selected] {
		background: transparent;
		border: none;
		mix-blend-mode: normal;
	}

	/* Selected BGM: a crisp 1px cyan border ON the bar (same selection language as the
	   video clips' cyan ring), clamped to the bar so it sits exactly on the 25px lane —
	   no oversized/dashed box, no spill below. */
	.effect[data-audio][data-selected] .bgm-bar {
		outline: 1px solid var(--imago-neon-cyan, #00f0ff);
		outline-offset: -1px;
	}
`

export const styles = css`
	${base_styles}
	${imago_pass_a}
`
