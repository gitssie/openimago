import {html} from "@benev/slate"

import {styles} from "./styles.js"
import {shadow_view} from "../../../../context/context.js"
import volumeSvg from "../../../../icons/gravity-ui/volume.svg.js"
import volumeSlashSvg from "../../../../icons/gravity-ui/volume-slash.svg.js"
import {laneHeight} from "../../../../../patches/timeline-lanes"
import {getEffectsOnTrack} from "../../../../context/controllers/timeline/utils/get-effects-on-track.js"

// 60px flat-black TRACK-HEADER gutter (openimago-scml; folded into the vendored 1.1.3
// sidebar in openimago-wmns Pass B.4). The approved design (docs/images/cut_panel.png)
// shows a narrow per-track icon column: a KIND ICON (video→clip, audio→music note,
// empty→wave) + a working VOLUME/MUTE toggle. The native 1.1.3 sidebar's index / eye
// (visibility) / lock toggles are NOT rendered (the rough-cut editor doesn't need them) —
// the actions still exist on the context, we just don't draw them in the 60px column.
// Width is 60px (sidebar/styles.ts), matched by the ruler-row spacer in component.ts so
// the ruler stays aligned with clip x-positions via 1.1.3's matching-width mechanism.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

type TrackKind = "video" | "bgm" | "empty"

/** Derive the header kind from the effects already laid on this track. */
function trackKind(effects: ReturnType<typeof getEffectsOnTrack>): TrackKind {
	if (effects.some(e => e.kind === "video" || e.kind === "image")) return "video"
	if (effects.some(e => e.kind === "audio")) return "bgm"
	return "empty"
}

// Inline, flat, 18px, currentColor kind icons (shadow DOM can't use the host's icons).
// Glyphs traced from docs/images/cut_panel.png: video = a PLAY triangle in a rounded
// box, narration = a symmetric voice/level waveform, BGM = a single eighth note.
const playIcon = html`
	<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
		stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="3" y="5" width="18" height="14" rx="3" />
		<path d="M10 9l5 3-5 3z" />
	</svg>
`
const musicIcon = html`
	<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
		stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M9 18V5l8-2v4" />
		<circle cx="6.5" cy="18" r="2.5" />
	</svg>
`
const waveIcon = html`
	<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
		stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M5 10v4M8.5 8v8M12 5v14M15.5 8v8M19 10v4" />
	</svg>
`
function kindIcon(kind: TrackKind) {
	if (kind === "video") return playIcon
	if (kind === "bgm") return musicIcon
	return waveIcon
}
function kindLabel(kind: TrackKind): string {
	if (kind === "video") return "视频轨道"
	if (kind === "bgm") return "背景音乐轨道"
	return "音频轨道"
}

export const TrackSidebar = shadow_view(use => (index: number, trackId: string) => {
	use.styles(styles)
	use.watch(() => use.context.state)

	const state = use.context.state
	const isMuted = state.tracks.find(track => track.id === trackId)?.muted
	const track_effects = getEffectsOnTrack(use.context.state, index)
	const kind = trackKind(track_effects)

	// Cell height MIRRORS the track row's lane height (shared timeline-lanes source)
	// so the kind-icon stays vertically centered on its lane. The 8px inter-lane gap
	// is the host's margin-bottom (sidebar/styles.ts), matching the track row's.
	const lane_height = laneHeight(track_effects)

	// The empty NARRATION lane shows ONLY its wave kind-icon — no volume/mute toggle
	// (docs/images/cut_panel.png: middle row has the wave glyph and no speaker). The
	// video + BGM lanes carry a working volume/mute toggle.
	const showVolume = kind !== "empty"

	return html`
		<div class="switches" data-kind=${kind} role="presentation" aria-label=${kindLabel(kind)} style="height: ${lane_height}px;">
			<div class="items">
				<span class="kind-icon">${kindIcon(kind)}</span>
				${showVolume ? html`
					<button
						class="mute"
						?data-active=${isMuted}
						aria-label=${isMuted ? "取消静音" : "静音"}
						aria-pressed=${isMuted ? "true" : "false"}
						@click=${() => use.context.actions.toggle_track_muted(trackId)}
					>${isMuted ? volumeSlashSvg : volumeSvg}</button>
				` : null}
			</div>
		</div>
	`
})
