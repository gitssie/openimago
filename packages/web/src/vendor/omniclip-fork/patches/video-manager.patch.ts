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
// PLAYBACK-ONLY PREVIEW (openimago-s6ki): omniclip builds the fabric Canvas with
// interactivity on (no selection:false; FabricImages have no selectable:false), so
// the upper-canvas lets you DRAG/move the video object. The cut-editor preview is
// playback-only, so we disable object targeting with the single global fabric lever
// `canvas.skipTargetFind = true` (+ `selection = false`): fabric then ignores all
// object hit-testing → no move cursor, no drag, no marquee select, but it still
// renders + plays. Set here (idempotently, on the compositor's canvas) rather than
// via a new controller patch — the flag is global, so one assignment covers the
// whole preview; add_video_effect is the single per-clip creation point, a reliable
// place the canvas already exists. Timeline clip selection is a SEPARATE mechanism
// on the omni-timeline DOM and is unaffected.
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

  // ── Why three "width"s must collapse to one (openimago-xyli) ────────────────
  // Fabric's FabricImage._renderFill (fabric 7, traced from
  // node_modules/fabric/dist/index.mjs:19651) draws with, for our no-crop /
  // no-filter case (cropX=cropY=0, _filterScalingX/Y=1):
  //     w = this.width                          // the FabricImage's OWN width
  //     elWidth = element.naturalWidth || element.width   // <video> has no
  //                                              //   naturalWidth → element.width
  //     sW       = min(w, elWidth)              // source-copy width
  //     maxDestW = min(w, elWidth)              // dest draw width (filterScale=1)
  //     x = -w / 2                              // dest origin (CENTER origin)
  //     ctx.drawImage(el, 0,0, sW,sH, x,y, maxDestW,maxDestH)
  // then the object transform applies scaleX/scaleY around (left, top).
  //
  // omniclip builds the FabricImage from effect.rect (canvas-sized 1080×1920), so
  // this.width=1080 while the decoded video is 720. If we leave this.width=1080
  // but set element.width=720, fabric centers on w=1080 (x=-540) yet copies only
  // sW=min(1080,720)=720 → the box is [-540, 180], which after scaleX=1.5 lands at
  // [-270, 810] instead of [0, 1080] (the residual bug). Conversely keeping
  // element.width=1080 makes fabric read a 1080-wide source rect from a 720-wide
  // bitmap (out-of-range source) — also wrong.
  //
  // The coherent fix: collapse ALL THREE width concepts to the intrinsic size
  // (this.width = element.width = videoW), so w == elWidth == videoW → sW ==
  // maxDestW == videoW with no clamp asymmetry, and the object's own scaleX does
  // 100% of the scaling. The drawn box is then [-videoW/2, +videoW/2] in local
  // space; the center-origin placement below puts that box's center at the canvas
  // center for an exact edge-to-edge cover fill.
  element.width = videoW
  element.height = videoH
  fabricVideo.width = videoW
  fabricVideo.height = videoH

  // coverScaleRect returns left/top in TOP-LEFT-origin coordinates, but omniclip's
  // FabricImages use fabric 7's default CENTER origin: left/top address the
  // object's CENTER. Convert per-axis with the general formula
  // `center = edge + (this.width * scaleX) / 2`, using the FabricImage's OWN
  // width/height (now == videoW/H, the same dimension fabric centers on via
  // x = -w/2) — NOT a canvasW/2 shortcut. Only offset an axis whose origin is
  // actually 'center', so the conversion stays correct for 'left'/'top' origins.
  const originX = (fabricVideo as { originX?: string }).originX
  const originY = (fabricVideo as { originY?: string }).originY
  const placedLeft = originX === 'center' ? left + (fabricVideo.width * scaleX) / 2 : left
  const placedTop = originY === 'center' ? top + (fabricVideo.height * scaleY) / 2 : top

  fabricVideo.set({ scaleX, scaleY, left: placedLeft, top: placedTop })
  fabricVideo.setCoords?.()
  // Mirror the origin-resolved (center) fit onto the FabricImage's OWN effect copy.
  // CRASH FIX (openimago-jo5q): upstream builds the FabricImage with
  // `effect: { ...effect }` (SHALLOW), so `fabricVideo.effect.rect` is the SAME
  // FROZEN reference as omniclip's STATE effect.rect — mutating a field
  // (`effect.rect.scaleX = ...`) throws "Cannot assign to read only property". So we
  // REPLACE `.rect` with a fresh object on the (non-frozen) shallow-copy effect
  // instead of mutating the frozen one. Defensive try/catch so a frozen/sealed effect
  // never throws here again.
  //
  // PERSISTENCE NOTE: omniclip's update_canvas_objects reads from the STATE effect
  // (`state.effects.find(...).rect`), NOT this copy, so this write-back does not
  // itself persist the fit — the fit survives because applyCoverFit RECOMPUTES from
  // intrinsic dims on every recreate (the single FabricImage creation point). The
  // fresh-rect mirror just keeps fabricVideo.effect self-consistent for any reader.
  const fabricEffect = (fabricVideo as { effect?: { rect?: Record<string, unknown> } }).effect
  if (fabricEffect?.rect) {
    try {
      fabricEffect.rect = {
        ...fabricEffect.rect,
        scaleX,
        scaleY,
        position_on_canvas: { x: placedLeft, y: placedTop },
      }
    } catch {
      // frozen/sealed effect object → skip the mirror; the recompute-on-recreate
      // path keeps the fit regardless.
    }
  }
  compositor?.canvas?.requestRenderAll?.()
}

/**
 * Make the preview canvas playback-only: fabric ignores object targeting so the
 * video can't be selected or dragged. Global + idempotent — assigning the flags
 * again on every clip add is harmless.
 */
function disableCanvasInteraction(compositor: any): void {
  const canvas = compositor?.canvas
  if (!canvas) return
  canvas.skipTargetFind = true
  canvas.selection = false
}

export class VideoManager extends UpstreamVideoManager {
  add_video_effect(effect: any, file: any, recreate?: boolean): void {
    super.add_video_effect(effect, file, recreate)
    disableCanvasInteraction((this as unknown as { compositor: any }).compositor)
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
