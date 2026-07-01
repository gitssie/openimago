// Clip context-menu target resolution — pure, headless-testable (openimago-p90g).
//
// omniclip's Effect view renders the trim-handle overlay (`.trim-handles`, holding
// the `.trim-handle-left/right` grips) as a SIBLING of the clip body `.effect`, not
// a descendant. So a right-click that starts on a trim-handle produces a
// `composedPath()` that never contains `.effect` — the old `.effect`-only gate then
// closed the menu. This predicate treats BOTH the clip body and the trim-handle
// overlay as clip targets, so the menu opens either way. It reads only the class
// lists along the path, keeping it DOM-free (the browser gate maps `composedPath()`
// element classLists into it).

/** Classes marking an element as part of a clip (body or trim-handle overlay). */
const CLIP_TARGET_CLASSES: ReadonlySet<string> = new Set([
  'effect',
  'trim-handles',
  'trim-handle-left',
  'trim-handle-right',
])

/**
 * True when any element along a contextmenu composedPath belongs to a clip —
 * either its `.effect` body or its sibling trim-handle overlay.
 *
 * @param classListsInPath ordered class lists of the path elements (leaf → root)
 */
export function isClipContextTarget(
  classListsInPath: Iterable<Iterable<string>>,
): boolean {
  for (const classList of classListsInPath) {
    for (const cls of classList) {
      if (CLIP_TARGET_CLASSES.has(cls)) return true
    }
  }
  return false
}
