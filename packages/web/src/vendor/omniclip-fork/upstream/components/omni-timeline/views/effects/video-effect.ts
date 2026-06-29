import {html, css, GoldElement} from "@benev/slate"

import {Effect} from "./parts/effect.js"
import {shadow_view} from "../../../../context/context.js"
import {VideoEffect as XVideoEffect} from "../../../../context/types.js"
// Fork filmstrip helpers (pure, also unit-tested + shared by other patches, so they
// stay in patches/): the first-frame sprite width math + the async frame-0 crop cache.
import {effectWidthPx, FILMSTRIP_TILE_W} from "../../../../../patches/filmstrip-sprite-css"
import {ensureFrame0} from "../../../../../patches/filmstrip-frame0"

// Static sprite-sheet filmstrip (openimago-78m9/6aew), folded into the vendored 1.1.3
// VideoEffect view (openimago-wmns Pass B; folds video-effect.patch.ts). Replaces 1.1.3's
// native per-frame Filmstrip (client-side seek→drawImage→toDataURL per visible cell — the
// lag/flicker/white-frame source) with ONE div that statically tiles the source FIRST
// FRAME via CSS background-repeat. The clip's filmstrip_* fields (sprite url + frame count)
// are threaded onto the effect by hydrate-from-cut.
//
// KEEPS the native compose contract: the on_media_change("added") listener still runs
// compositor.recreate({...state, effects:[effect], filters}, media) with 1.1.3's
// signature — hydrate-from-cut's re-announce (openimago-74y8) depends on it. Only the
// FILMSTRIP rendering changed; the preview PLAYER still composes via WebCodecs/pixi.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

// Cell height = the full 50px omniclip lane; the sprite frames are 9:16 portrait (28×50),
// tiled at a FIXED FILMSTRIP_TILE_W×CELL_H cell via repeat-x so density follows clip width
// and the frame never stretches.
const CELL_H = 50

// Effect carries custom filmstrip_* fields hydrate adds (not on the upstream type).
type FilmstripEffect = XVideoEffect & {
	filmstrip_url?: string | null
	filmstrip_frame_count?: number | null
}

export const VideoEffect = shadow_view(use => (effect: XVideoEffect, timeline: GoldElement) => {
	const media = use.context.controllers.media
	const compositor = use.context.controllers.compositor

	// NARROW subscription (openimago-2m8d): re-render ONLY when this view's output inputs
	// change (trim window + sprite inputs + zoom + effects.length), NOT on every state
	// dispatch — `timecode` ticks every frame during playback and would rebuild the strip.
	// The collector reads state FRESH each call and re-finds the live effect so it never
	// closes over a stale one.
	use.watch(() => {
		const state = use.context.state
		const e = (state.effects.find(x => x.id === effect.id) ?? effect) as FilmstripEffect
		return [
			e.start,
			e.end,
			e.file_hash,
			e.filmstrip_url,
			e.filmstrip_frame_count,
			state.zoom,
			state.effects.length,
		]
	})

	// ONE geometry source for both the span and the filmstrip: the LIVE effect from state
	// (post-split end/start), falling back to the passed arg before it lands in state.
	const live = (use.context.state.effects.find(e => e.id === effect.id) ?? effect) as FilmstripEffect

	// Re-render trigger for when the async frame-0 crop lands: bump a counter so the view
	// re-renders and swaps the transient sprite-repeat fallback for the exact first frame.
	const [frame0Tick, setFrame0Tick] = use.state(0)

	// Compose the clip into the pixi preview compositor when its media lands — the 1.1.3
	// native contract (same guard + recreate signature). hydrate-from-cut publishes
	// on_media_change AFTER this view mounts, so the listener fires recreate then
	// (openimago-74y8). The native Filmstrip's on_file_found/recalculate calls are gone
	// with the per-frame strip.
	use.mount(() => {
		const dispose = media.on_media_change(async ({files, action}) => {
			if (action !== "added") return
			for (const {hash} of files) {
				const is_effect_already_composed = compositor.managers.videoManager.get(effect.id)
				if (hash === effect.file_hash && !is_effect_already_composed) {
					const filter = use.context.state.filters.find(f => f.targetEffectId === effect.id)
					compositor.recreate({
						...use.context.state,
						effects: [effect],
						filters: filter ? [filter] : [],
					}, media)
				}
			}
		})
		return () => dispose()
	})

	// ── Static single-div filmstrip — source FIRST frame tiled via repeat-x ──────────
	const render_filmstrip = () => {
		// The sprite is a property of the SOURCE media (file_hash), not the clip segment. A
		// native SPLIT may not carry our filmstrip_* fields onto the new half, so fall back
		// to ANY effect in state with the same file_hash that DOES have a sprite.
		const fallback = use.context.state.effects.find((e) => {
			const fe = e as FilmstripEffect
			return fe.file_hash === live.file_hash && !!fe.filmstrip_url && !!fe.filmstrip_frame_count
		}) as FilmstripEffect | undefined
		const spriteSource: FilmstripEffect =
			live.filmstrip_url && live.filmstrip_frame_count ? live : (fallback ?? live)

		const spriteUrl = spriteSource.filmstrip_url
		const frameCount = spriteSource.filmstrip_frame_count
		// No sprite (orphan / pre-sprite data) → flat lane, no broken images.
		if (!spriteUrl || !frameCount || frameCount < 1) {
			return html`<div class="filmstrip"></div>`
		}

		// Effect's real rendered width via the upstream zoom formula (same live start/end the
		// inner Effect span uses). 0 width → empty lane (never a NaN-sized div).
		const widthPx = effectWidthPx(live.start, live.end, use.context.state.zoom)
		if (widthPx <= 0) {
			return html`<div class="filmstrip"></div>`
		}

		// Crop the sprite's leftmost frame to a standalone dataURL ONCE per sprite (cached),
		// then tile THAT via repeat-x. Until the async crop lands, tile the FULL sprite as a
		// transient fallback (each frame maps to one cell), then bump state to swap in the
		// exact first frame.
		const frame0 = ensureFrame0(spriteUrl, frameCount, () => setFrame0Tick(frame0Tick + 1))

		let bgImage: string
		let bgSize: string
		if (frame0) {
			bgImage = frame0
			bgSize = `${FILMSTRIP_TILE_W}px ${CELL_H}px`
		} else {
			bgImage = spriteUrl
			bgSize = `${FILMSTRIP_TILE_W * Math.max(1, frameCount)}px ${CELL_H}px`
		}

		// CANCEL the parent .content shift: the Effect view wraps our filmstrip in
		// `<span class="content" style="transform: translateX(-effect.start * 2^zoom)px)">`
		// (it windows into the [start,end] trim range). Our strip is sized to the trim WINDOW
		// only, so apply the exact inverse so any inPoint>0 clip (a split's second half) lands
		// back inside the lane.
		const contentShiftPx = live.start * Math.pow(2, use.context.state.zoom)
		return html`<div
			class="filmstrip"
			style="
				width: ${widthPx}px;
				transform: translateX(${contentShiftPx}px);
				background-image: url('${bgImage}');
				background-repeat: repeat-x;
				background-size: ${bgSize};
				background-position: 0 0;
			"
		></div>`
	}

	const styleBlock = css`
		.content {
			width: 100%;
		}
		/* SINGLE-DIV filmstrip: one node tiling the source first frame via repeat-x at a
		   fixed FILMSTRIP_TILE_W×CELL_H cell (set inline). overflow:hidden clips the trailing
		   partial tile + the translateX overflow. No per-tile child nodes (the ~290-div
		   subtree was the paint/composite hotspot). */
		.filmstrip {
			height: ${CELL_H}px;
			overflow: hidden;
			pointer-events: none;
		}
	`

	return html`${Effect([timeline, live, html`${render_filmstrip()}`, styleBlock])}`
})
