import {css} from "@benev/slate"

// Combined CapCut-style control bar styles (openimago-4qwj; folded into the vendored
// toolbar in openimago-wmns Pass B.3, from toolbar-styles.ts). ONE restrained horizontal
// bar: edit/history on the LEFT, playback transport + current/total time in the CENTER,
// mute + fullscreen + zoom on the RIGHT. Flat imago look via the inherited --imago-* vars
// (they cross the shadow boundary); the single cyan accent is reserved for selection, so
// the bar stays neutral. BROWSER-ONLY.
export const styles = css`
	:host {
		display: block;
		width: 100%;
		box-sizing: border-box;
		min-height: 46px;
		background: var(--imago-bg-deep, #0a0a0f);
		--transition: 0.2s;
		/* CURRENT timecode reads as bright neutral off-white (brighter than the muted-grey
		   total). Scoped to this bar via a token so a future re-tint is local. */
		--cut-time-current: var(--imago-text-primary, #e8e8ec);
	}

	.toolbar {
		display: block;
		width: 100%;
		box-sizing: border-box;
	}

	/* One full-width bar; three groups LEFT (.flex — history/split) · CENTER (.transport —
	   timecode/play) · RIGHT (.right — mute/fullscreen/zoom). A 3-column grid (1fr auto 1fr)
	   centers the middle group on the bar's TRUE center regardless of side widths. */
	.tools {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		width: 100%;
		align-items: center;
		box-sizing: border-box;
		gap: 0.75em;
		padding: 6px 12px;
		background: var(--imago-bg-deep, #0a0a0f);
	}

	button {
		border: none;
		background: transparent;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 6px;
		color: var(--imago-text-muted, #989898);
		fill: currentColor;
		transition: color var(--transition) ease, background var(--transition) ease;
	}

	button:hover:not([disabled]) {
		color: var(--imago-text-primary, #fff);
		background: color-mix(in srgb, var(--imago-text-primary, #fff) 8%, transparent);
	}

	button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--imago-border-cyan-active, rgba(0, 224, 255, 0.4));
	}

	button[disabled] {
		opacity: 0.4;
		cursor: default;
	}

	svg {
		width: 20px;
		height: 20px;
		display: block;
	}

	/* ── LEFT: history (undo/redo) + split ── */
	.flex {
		display: flex;
		align-items: center;
		gap: 0.25em;
		justify-self: start;
	}

	.history {
		display: flex;
		fill: var(--imago-text-faint, #555454);
	}

	.history button[data-past],
	.history button[data-future] {
		fill: var(--imago-text-muted, #989898);
	}

	.split {
		margin: 0 0.4em;
	}

	.split svg,
	.remove svg {
		width: 17px;
		height: 17px;
	}

	/* ── CENTER: current-time · play/pause · total-time (00:01 ▶ 01:04) ── */
	.transport {
		display: flex;
		align-items: center;
		gap: 0.7em;
		justify-self: center;
	}

	/* Play/pause: neutral white glyph on a subtle filled disc (no glow; cyan is reserved
	   for the selected clip). */
	.transport .playpause {
		color: var(--imago-text-primary, #fff);
		width: 34px;
		height: 34px;
		border-radius: 999px;
		border: none;
		background: color-mix(in srgb, var(--imago-text-primary, #fff) 9%, transparent);
	}

	.transport .playpause:hover:not([disabled]) {
		color: var(--imago-text-primary, #fff);
		background: color-mix(in srgb, var(--imago-text-primary, #fff) 15%, transparent);
	}

	/* The two times flank the play button. Tabular-nums so digits don't shift it off-center. */
	.transport .current,
	.transport .total {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.transport .current {
		color: var(--cut-time-current, #e8e8ec);
	}

	.transport .total {
		color: var(--imago-text-faint, #888);
	}

	/* ── RIGHT: mute · fullscreen · zoom-out · slider · zoom-in ── */
	.right {
		display: flex;
		align-items: center;
		gap: 0.5em;
		justify-self: end;
	}

	/* Master-mute speaker: muted reads as theme pink (an "off" warning). */
	.mute[data-muted='true'],
	.mute[data-muted='true']:hover:not([disabled]) {
		color: var(--imago-neon-pink, #f13131);
	}

	.zoom {
		display: flex;
		align-items: center;
		gap: 0.25em;
	}

	/* Flat zoom slider between the magnifier buttons. */
	.zoom-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 96px;
		height: 4px;
		border-radius: 999px;
		background: var(--imago-border-soft, rgba(255, 255, 255, 0.14));
		outline: none;
		cursor: pointer;
		margin: 0 2px;
	}

	.zoom-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--imago-text-primary, #e8e8ec);
		border: none;
		cursor: pointer;
	}

	.zoom-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 999px;
		background: var(--imago-text-primary, #e8e8ec);
		border: none;
		cursor: pointer;
	}

	.zoom-slider:focus-visible {
		box-shadow: 0 0 0 2px var(--imago-border-cyan-active, rgba(0, 224, 255, 0.4));
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
`
