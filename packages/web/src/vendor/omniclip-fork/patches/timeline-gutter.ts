// Shared geometry constant for the left TRACK-HEADER GUTTER (openimago-scml).
//
// ONE source of truth for the reserved left-gutter width, imported by BOTH the
// content-shift styles patch (omni-timeline-styles.patch.ts — pads `.timeline`
// left by this amount) AND the per-track header chip (track-view.patch.ts — pins
// the chip into that opened gutter). Keeping the two in lockstep is what makes the
// gutter a REAL reserved column instead of an overlay: the clip area starts at
// exactly GUTTER_PX, and the header chip occupies exactly 0..GUTTER_PX.
//
// Tuned to match docs/images/cut_panel.png (the user's framing: "margin-left:60px
// and use that space to show the track-headers").
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

/** Reserved left-gutter width, in CSS px. */
export const GUTTER_PX = 60
