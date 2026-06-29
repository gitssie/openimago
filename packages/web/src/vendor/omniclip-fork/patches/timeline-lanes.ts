// Shared geometry for the timeline LANE heights + inter-lane gaps (openimago-g1hb).
//
// ONE source of truth (mirrors timeline-gutter.ts for the horizontal axis) so the
// places that must agree on per-lane VERTICAL geometry can't drift:
//   1. calculate_effect_track_placement — the cumulative TOP (px) of each lane
//      (drives every absolutely-positioned effect, the transition + proposal
//      indicators)
//   2. calculate_effect_track_index      — the inverse (pointer y → lane index)
//   3. the visual track rows (track/view) + sidebar cells (sidebar/view+styles)
//      + the .effect / .trim-handles / .bgm-bar box heights (parts/effect,
//      audio-effect)
//
// Heights + gap are sampled pixel-for-pixel from docs/images/cut_panel.png:
//   video lane  = 50px  (tall filmstrip lane)
//   audio/empty = 25px  (short narration + BGM lanes)
//   text-only   = 30px  (upstream's narrow text lane, preserved)
//   gap         = 8px   black timeline-bg gap BELOW each lane
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

/** Tall lane height (video / image clips) — unchanged from upstream's 50px so the
 *  9:16 sprite filmstrip cells (28×50, openimago-78m9) still fit exactly. */
export const VIDEO_LANE_PX = 50
/** Short lane height (narration + BGM lanes, and any empty lane). */
export const AUDIO_LANE_PX = 25
/** Upstream's narrow text-only lane (preserved; unused in the rough-cut editor). */
export const TEXT_LANE_PX = 30
/** Black timeline-bg gap rendered BELOW each lane (between rows). */
export const LANE_GAP_PX = 8

/**
 * Per-lane height derived from the effects laid on that track. Keyed off effect
 * KIND so placement, the inverse index lookup, and the views all agree:
 *   has video/image → tall VIDEO lane; only text → narrow TEXT lane; audio OR
 *   EMPTY → short AUDIO lane (the empty narration lane has no effects → short).
 */
export function laneHeight(effects: ReadonlyArray<{kind: string}>): number {
	const hasVisual = effects.some(e => e.kind === "video" || e.kind === "image")
	if (hasVisual) return VIDEO_LANE_PX
	const onlyText = effects.length > 0 && effects.every(e => e.kind === "text")
	if (onlyText) return TEXT_LANE_PX
	return AUDIO_LANE_PX
}
