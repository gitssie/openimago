// Cover-scale geometry for the preview canvas (openimago-kzb3).
//
// omniclip renders each clip as a fabric FabricImage wrapping the raw <video>
// element; fabric draws it at the video's INTRINSIC pixel size (videoWidth ×
// videoHeight) × {scaleX, scaleY} positioned at (left, top). With omniclip's
// defaults (scale 1, pos 0) a 720×1280 video sits small in the top-left of a
// 1080×1920 canvas. To fill the canvas we apply a CSS-`object-fit:cover`-style
// transform: scale up uniformly by the LARGER axis ratio (so neither axis leaves
// a gap — the overflow is cropped), then offset to center.
//
// Pure + dependency-free → unit-testable; the fork applies the result to the
// FabricImage in hydrate's first-frame nudge.

export interface CoverRect {
  scaleX: number
  scaleY: number
  left: number
  top: number
}

const IDENTITY: CoverRect = { scaleX: 1, scaleY: 1, left: 0, top: 0 }

/**
 * Compute the uniform cover scale + centering offset to fill `canvasW × canvasH`
 * with a `videoW × videoH` source. scale = max(canvasW/videoW, canvasH/videoH)
 * (cover: no gaps, crop overflow); left/top center the scaled video (negative on
 * the cropped axis). Returns identity (scale 1, no offset) for any non-finite or
 * non-positive dimension so a bad measurement never yields NaN transforms.
 */
export function coverScaleRect(
  canvasW: number,
  canvasH: number,
  videoW: number,
  videoH: number,
): CoverRect {
  if (
    !Number.isFinite(canvasW) || !Number.isFinite(canvasH) ||
    !Number.isFinite(videoW) || !Number.isFinite(videoH) ||
    canvasW <= 0 || canvasH <= 0 || videoW <= 0 || videoH <= 0
  ) {
    return { ...IDENTITY }
  }
  const scale = Math.max(canvasW / videoW, canvasH / videoH)
  return {
    scaleX: scale,
    scaleY: scale,
    left: (canvasW - videoW * scale) / 2,
    top: (canvasH - videoH * scale) / 2,
  }
}
