// First-frame extraction for the single-div repeat-x filmstrip (openimago-6aew).
//
// PERF: the previous filmstrip rendered `tileCount` (up to MAX_CELLS≈290) fixed-width
// <div>s per clip, each with a background-image. 7+ clips ≈ 2000 painted nodes, and
// dragging repainted the lot — the measured jank was browser paint/composite, not JS
// (perf-diag: all render labels <0.2ms/s). The fix collapses each filmstrip to ONE
// <div> that tiles the source FIRST FRAME via `background-repeat: repeat-x`.
//
// CSS `repeat-x` repeats the WHOLE background image, so it cannot pick frame 0 out of
// the N-frame sprite strip (672×50, 24×28). We therefore crop the sprite's leftmost
// frame (0,0 → frameW×frameH) to a standalone 28×50-ish dataURL ONCE per sprite via an
// offscreen canvas, cache it by sprite URL (module-level — shared across every clip and
// across re-renders), and tile THAT. Exact source first frame, reuses the existing
// sprite asset, zero per-frame decode. Same first-frame-anchor semantic as before
// (cut-editor-filmstrip-firstframe), just one node instead of ~290.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

// Resolved frame-0 dataURL per sprite URL. `null` = crop attempted but failed (don't
// retry forever); a string = ready to tile. Absent = not yet started.
const frame0Cache = new Map<string, string | null>()
// In-flight crops per sprite URL so concurrent clips sharing a source crop ONCE.
const inFlight = new Map<string, Promise<string | null>>()
// Pending onReady callbacks from callers that found a crop in-flight (openimago-r7to).
// All fire synchronously — in the same .then() micro-task as the initiating caller —
// when the crop settles. Using a direct callback list rather than .then(cb) chaining
// avoids an extra micro-task between the initiating view's onReady and the sibling's,
// which would cause Benev Slate's shadow_view lifecycle (use.mount/use.watch) to see
// the second setFrame0Tick at an unexpected re-entry point and corrupt the pixi
// compositor's videoManager state.
const pendingCallbacks = new Map<string, Array<(dataUrl: string | null) => void>>()

/** Synchronously read the cached frame-0 dataURL for a sprite, if already cropped.
 *  Returns undefined when not yet computed, null when cropping failed. */
export function getCachedFrame0(spriteUrl: string): string | null | undefined {
  return frame0Cache.get(spriteUrl)
}

/**
 * Ensure the sprite's first frame is cropped + cached. Idempotent: returns the cached
 * value immediately if present, else dedupes on an in-flight crop. `frameCount` divides
 * the sprite width into frames; the leftmost frame (frame 0) is cropped at the image's
 * NATIVE frame size (naturalWidth/frameCount × naturalHeight) so it stays pixel-exact
 * regardless of the CSS tile size it is later tiled at. `onReady` fires once when a NEW
 * crop resolves (so the caller can trigger a re-render to swap in the exact frame).
 *
 * When the crop is already in-flight (started by a sibling clip sharing the same sprite),
 * `onReady` is queued and fires in the same micro-task as the initiating caller's callback
 * — not in a chained .then() — so all views re-render together without an extra task
 * boundary that can race with the Benev Slate compositor lifecycle (openimago-r7to).
 */
export function ensureFrame0(
  spriteUrl: string,
  frameCount: number,
  onReady?: (dataUrl: string | null) => void,
): string | null | undefined {
  const cached = frame0Cache.get(spriteUrl)
  if (cached !== undefined) return cached
  if (inFlight.has(spriteUrl)) {
    // Queue this view's onReady so it fires when the in-flight crop lands.
    // Without this, only the clip that STARTED the crop gets its onReady fired;
    // sibling clips sharing the same sprite URL (split halves, same-source dupes)
    // stay on the transient fallback forever (openimago-r7to).
    if (onReady) {
      let cbs = pendingCallbacks.get(spriteUrl)
      if (!cbs) { cbs = []; pendingCallbacks.set(spriteUrl, cbs) }
      cbs.push(onReady)
    }
    return undefined
  }

  const promise = cropFirstFrame(spriteUrl, frameCount)
    .then((dataUrl) => {
      frame0Cache.set(spriteUrl, dataUrl)
      inFlight.delete(spriteUrl)
      onReady?.(dataUrl)
      // Fire all pending sibling callbacks synchronously in this same micro-task.
      const cbs = pendingCallbacks.get(spriteUrl)
      if (cbs) { pendingCallbacks.delete(spriteUrl); for (const cb of cbs) cb(dataUrl) }
      return dataUrl
    })
    .catch(() => {
      frame0Cache.set(spriteUrl, null)
      inFlight.delete(spriteUrl)
      onReady?.(null)
      const cbs = pendingCallbacks.get(spriteUrl)
      if (cbs) { pendingCallbacks.delete(spriteUrl); for (const cb of cbs) cb(null) }
      return null
    })
  inFlight.set(spriteUrl, promise)
  return undefined
}

/** Load the sprite and crop its leftmost frame to a dataURL. Resolves null on any
 *  failure (load error, tainted canvas, empty image) so the caller degrades to the
 *  transient sprite-repeat fallback rather than throwing. */
function cropFirstFrame(spriteUrl: string, frameCount: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    // Same-origin (public/mock or our own /api), but request anonymous CORS so a
    // cross-origin sprite that sends ACAO can still be read back from the canvas
    // instead of tainting it.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const n = Number.isFinite(frameCount) && frameCount >= 1 ? Math.floor(frameCount) : 1
        const frameW = Math.max(1, Math.floor(img.naturalWidth / n))
        const frameH = Math.max(1, img.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = frameW
        canvas.height = frameH
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        // Draw only the leftmost (frame 0) region of the strip.
        ctx.drawImage(img, 0, 0, frameW, frameH, 0, 0, frameW, frameH)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = spriteUrl
  })
}
