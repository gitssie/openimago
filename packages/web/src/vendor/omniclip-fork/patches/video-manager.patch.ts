// PATCH — cover-fit each preview video at its CREATION point (openimago-ua5d).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/context/controllers/compositor/parts/video-manager.js → export `VideoManager`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipVideoManagerPatch). compositor/controller.js does
// `import { VideoManager } from "./parts/video-manager.js"` then `new
// VideoManager(...)`, so redirecting that import makes the compositor use this
// subclass everywhere.
//
// WHY: omniclip builds each clip's FabricImage at intrinsic video size with
// scaleX/Y=1, left/top=0 — so a 720×1280 video sits small in the top-left of the
// 1080×1920 portrait canvas (openimago-kzb3). Cover-fitting AFTER the fact in
// hydrate (openimago-y3na) was racy: recreate()/compose rebuild the FabricImage
// from effect.rect and the <video>'s videoWidth is often 0 at nudge time. Since
// add_video_effect is the SINGLE creation point for every FabricImage (initial
// add AND every recreate), cover-fitting HERE — once the element's intrinsic size
// is known — is race-free and applies to every clip on every rebuild.
//
// We subclass the upstream VideoManager (imported from a src/ importer, which the
// resolveId guard does NOT redirect → no loop) and override add_video_effect to
// call super then cover-fit the freshly-created FabricImage.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { VideoManager as UpstreamVideoManager } from 'omniclip/x/context/controllers/compositor/parts/video-manager.js'
import { coverScaleRect } from 'src/utils/cut/cover-scale'

/**
 * Canvas (project) buffer size from the compositor's fabric canvas — this is the
 * resolution `set_canvas_resolution(1080,1920)` set at boot (openimago-vm5v), the
 * coordinate space the FabricImage is scaled within. Portrait fallback if unread.
 */
function canvasSizeFrom(compositor: any): { w: number; h: number } {
  const canvas = compositor?.canvas
  const w = canvas?.getWidth?.() || canvas?.width || 1080
  const h = canvas?.getHeight?.() || canvas?.height || 1920
  return { w, h }
}

/**
 * Cover-fit a fabric video object to the canvas using the <video>'s INTRINSIC
 * dimensions (the fabric 1.0 baseline). Uniform scale to cover + center, then
 * request a render. No-op until the element reports videoWidth/Height.
 */
function applyCoverFit(compositor: any, fabricVideo: any, element: HTMLVideoElement): void {
  const videoW = element.videoWidth
  const videoH = element.videoHeight
  if (!videoW || !videoH) {
    // Should never fire after the loadedmetadata-only wiring below: loadedmetadata
    // is the HTML-spec guarantee that videoWidth/Height are populated. A zero here
    // means a future regression silently defeating cover-fit (openimago-jkrg).
    if (import.meta.env.DEV) {
      console.warn(
        '[omniclip-fork] applyCoverFit skipped: zero video dimensions',
        { videoW, videoH },
      )
    }
    return
  }
  const { w: canvasW, h: canvasH } = canvasSizeFrom(compositor)
  const { scaleX, scaleY, left, top } = coverScaleRect(canvasW, canvasH, videoW, videoH)
  // Unify the element box with its intrinsic size so fabric's baseline matches
  // the dimensions coverScaleRect was computed against.
  element.width = videoW
  element.height = videoH
  fabricVideo.set({ scaleX, scaleY, left, top })
  fabricVideo.setCoords?.()
  // Persist onto the stored effect so a later compose/recreate keeps the fit.
  const effect = (fabricVideo as { effect?: { rect?: Record<string, unknown> } }).effect
  if (effect?.rect) {
    effect.rect.scaleX = scaleX
    effect.rect.scaleY = scaleY
    effect.rect.position_on_canvas = { x: left, y: top }
  }
  compositor?.canvas?.requestRenderAll?.()
}

export class VideoManager extends UpstreamVideoManager {
  add_video_effect(effect: any, file: any, recreate?: boolean): void {
    super.add_video_effect(effect, file, recreate)
    const fabricVideo: any = this.get(effect.id)
    const element = fabricVideo?.getElement?.() as HTMLVideoElement | undefined
    if (!fabricVideo || !element) return
    const compositor = (this as unknown as { compositor: any }).compositor
    if (element.videoWidth && element.videoHeight) {
      applyCoverFit(compositor, fabricVideo, element)
    } else {
      // Intrinsic size not known yet → cover-fit once metadata loads.
      // ONLY loadedmetadata: it is the sole HTML-spec guarantee that
      // videoWidth/Height are populated. loadeddata can fire first with
      // videoWidth still 0 inside omniclip's recreate()/element.load() flow,
      // racing past the metadata event and defeating cover-fit (openimago-jkrg).
      const onMeta = (): void => {
        element.removeEventListener('loadedmetadata', onMeta)
        applyCoverFit(compositor, fabricVideo, element)
      }
      element.addEventListener('loadedmetadata', onMeta, { once: true })
    }
  }
}
