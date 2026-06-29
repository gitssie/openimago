// hydrateFromCut — apply a canonical EpisodeCut into omniclip's live state
// (openimago-addv). The host maps cut.json → an ordered list of clips (URL +
// trim, via cut-omniclip-mapper + shot-media-resolver) and hands it here; the
// fork imports each clip's media (existing importFromUrl path) and places it as
// a positioned, trimmed video effect on track 0 via omniclip's actions, then
// applies transitions. Orphan clips (no url) are skipped by the host (they show
// via the data-no-file path), so every entry here has a url.
//
// This is the "apply full state" seam the OmniclipForkApi otherwise lacked:
// omniclip has no single set-state call, so we compose add_video_effect +
// set_effect_* from its action surface. BROWSER-ONLY.
//
// IMPORT ORDERING (openimago-0if6): the import loop is SERIAL and the compose is
// fire-and-forget. An earlier attempt to parallelize imports (openimago-ah1j) and
// then to AWAIT clip 0's first-paint signal before importing the rest
// (openimago-ac52) regressed the NORMAL tab-open: on a real open clip 0's
// drawable signal never fired, so awaiting it left the preview blank (canvas all
// 0,0,0,0). A slow-but-visible preview beats a fast-but-blank one, so the proven
// serial-import + fire-and-forget compose path is restored. DEV timing logs are
// kept (non-blocking) so first-paint can still be measured on the real flow.

import { omnislate } from 'omniclip/x/context/context.js'
import { importFromUrl } from './import-from-url'
import { setTransition, resetTransitions } from './transitions'
import type { HydrateBgm, HydrateClip, OmniTransition } from 'src/utils/cut/fork-contract'

const MS_PER_S = 1000

// Time-to-first-paint instrumentation (DEV-only, openimago-ah1j/0if6). Set when a
// hydrate begins; consumed once by the first nudgeFirstFrame redraw that puts a
// decoded frame on the canvas, so the open → clip-0-frame-painted latency is
// measurable on the REAL tab-open flow (not just forced remounts).
let firstPaintStart: number | null = null
let firstPaintLogged = false

/** Default rect — clips fill the portrait 9:16 frame (openimago-vm5v); trimming
 * is via start/end. Matches the 1080×1920 project resolution set at boot. */
function fullFrameRect() {
  return {
    width: 1080,
    height: 1920,
    scaleX: 1,
    scaleY: 1,
    position_on_canvas: { x: 0, y: 0 },
    rotation: 0,
  }
}

/**
 * Replace the timeline contents with the given clips (ordered) + transitions.
 * Clears any existing effects first so re-hydration on episode switch is clean.
 */
export async function hydrateFromCut(
  clips: HydrateClip[],
  transitions: OmniTransition[],
  bgm?: HydrateBgm,
): Promise<void> {
  const ctx = omnislate.context
  ctx.actions.remove_all_effects()

  if (import.meta.env.DEV) {
    console.time('[omniclip-fork] hydrateFromCut total')
    firstPaintStart = performance.now()
    firstPaintLogged = false
  }

  // (effectId, fileHash) per placed clip — the filmstrip refresh needs both: the
  // effect id to clear from the compositor's videoManager, the hash to re-announce.
  const placed: { id: string; fileHash: string }[] = []

  let cursorMs = 0
  for (const clip of clips) {
    // Import the clip's media (fetch → File → omniclip content-hash/IndexedDB).
    const imported = await importFromUrl(clip.url, { name: clip.name })
    placed.push({ id: clip.id, fileHash: imported.fileHash })

    const startMs = clip.inPointSeconds * MS_PER_S
    const endMs = clip.outPointSeconds * MS_PER_S
    const durationMs = endMs - startMs

    // Place a video effect for this clip and trim/position it to match the cut.
    // start/end are the SOURCE trim (used for cropping + the timeline span); they
    // are NOT used for the filmstrip. The filmstrip_* fields are custom extras
    // carried on the effect (omniclip stores arbitrary fields in state); the
    // patched video-effect view reads ONLY filmstrip_url + filmstrip_frame_count
    // to render the precomputed sprite's FIRST FRAME statically, tiled across the
    // clip width (openimago-78m9/jmcp, first-frame anchor decision
    // cut-editor-filmstrip-firstframe). It deliberately does NOT map a cell's
    // source-time→frame by inPoint — so any split half shows the SAME source
    // first-frame sprite and never renders blank (openimago-hkhm; the earlier
    // px5g inPoint-offset mapping that blanked the second split half is removed).
    ctx.actions.add_video_effect({
      kind: 'video',
      id: clip.id, // reuse the CutClip id so edits map back 1:1
      start_at_position: cursorMs,
      duration: durationMs,
      start: startMs,
      end: endMs,
      track: 0,
      file_hash: imported.fileHash,
      name: imported.name,
      thumbnail: imported.thumbnail,
      raw_duration: imported.rawDurationSeconds * MS_PER_S,
      frames: imported.frames,
      rect: fullFrameRect(),
      // Sprite + its frame count/dims — the ONLY filmstrip inputs the view reads.
      // Anchored to source frame 0; no inPoint/source-duration frame-window math.
      filmstrip_url: clip.filmstrip?.spriteUrl ?? null,
      filmstrip_frame_count: clip.filmstrip?.frameCount ?? null,
      filmstrip_frame_w: clip.filmstrip?.frameW ?? null,
      filmstrip_frame_h: clip.filmstrip?.frameH ?? null,
    })
    cursorMs += durationMs
  }

  // Apply transitions after all clips exist (each keyed by the clip it follows).
  // setTransition owns the fork's transition store + clamps; reset first so a
  // re-hydration on episode switch doesn't accumulate stale transitions.
  resetTransitions()
  for (const transition of transitions) {
    setTransition(transition)
  }

  // Place the Cut's BGM bed on its OWN audio track → the green waveform lane
  // under the video track (openimago-w5bu, docs/images/cut_panel.png). omniclip
  // boots with several empty tracks, so track 1 is the lane directly below the
  // video clips (track 0); no add_track needed. Imported via the same media path
  // as clips (importFromUrl handles audio kind), then re-announced so the
  // AudioEffect view's waveform composes (its on_media_change("added") listener
  // misses the import-time publish — same mount-after-publish race as clips).
  //
  // NON-FATAL (openimago-tc8t): BGM is a non-essential lane. A failed import
  // (e.g. a 401 on the authed /download, or an unreachable url) must NOT crash the
  // whole editor — warn + skip the lane (like an orphan clip), leaving all video
  // clips + transitions intact so the editor always renders.
  try {
    await placeBgm(bgm)
  } catch (err) {
    console.warn(
      '[omniclip-fork] BGM import failed — skipping the audio lane; clips render normally',
      err,
    )
  }

  // Compose the placed clips into the WebCodecs PREVIEW compositor (openimago-vwjl,
  // refined for 78m9). The patched VideoEffect view composes a clip in its
  // on_media_change("added") listener, but we publish "added" INSIDE importFromUrl
  // — BEFORE add_video_effect mounts the view — so the mounted listener misses it.
  // Re-publish after the views mount so each composes. The listener is gated by
  // `!is_effect_already_composed`, so first DELETE each effect from the
  // videoManager (the guard then passes) and re-announce. NOTE: with the static
  // sprite filmstrip (78m9) this no longer drives any thumbnail drawing — it ONLY
  // ensures playback composition; the timeline strip renders from the precomputed
  // sprite with no events. Fire-and-forget (no on_media_change await; per 1mcb) —
  // CRITICAL: do NOT await this (openimago-0if6); the first-paint signal it waits
  // on does not fire on a normal tab-open, so awaiting it leaves the canvas blank.
  composePlacedClips(placed)

  if (import.meta.env.DEV) console.timeEnd('[omniclip-fork] hydrateFromCut total')
}

/** The audio lane sits directly below the video clips (track 0). omniclip boots
 *  with several empty tracks, so this index already exists. */
const BGM_TRACK = 1

/**
 * Import + place the Cut's BGM bed as an audio effect on its own track (the
 * green waveform lane, openimago-w5bu). No-op when there is no bgm. Spans the
 * full imported audio length from position 0. After adding the effect, re-announce
 * the media so the AudioEffect view's waveform composes: importFromUrl publishes
 * on_media_change("added") BEFORE add_audio_effect mounts the view, so the
 * mounted listener (gated by !is_effect_already_composed) misses it — clear the
 * audioManager entry, then re-publish so the gate passes and the waveform draws.
 */
async function placeBgm(bgm: HydrateBgm | undefined): Promise<void> {
  if (!bgm) return
  const ctx = omnislate.context

  // Forward the host's auth headers (openimago-tc8t) so the authed
  // /api/.../download fetch carries the Bearer token; undefined for unauthed urls.
  const imported = await importFromUrl(bgm.url, { name: bgm.name, headers: bgm.headers })
  const durationMs = imported.rawDurationSeconds * MS_PER_S

  ctx.actions.add_audio_effect({
    kind: 'audio',
    id: bgm.id, // reuse the bgm artifactId so edits map back 1:1
    start_at_position: 0,
    duration: durationMs,
    start: 0,
    end: durationMs,
    track: BGM_TRACK,
    raw_duration: durationMs,
    file_hash: imported.fileHash,
    name: imported.name,
  })

  // Re-announce so the (now-mounted) AudioEffect view composes its waveform.
  const media = ctx.controllers.media
  const audioManager = ctx.controllers.compositor.managers.audioManager
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      audioManager.delete(bgm.id)
      const file = media.get(imported.fileHash)
      if (!file) return
      media.on_media_change.publish({
        files: [{ hash: imported.fileHash, file, kind: 'audio' }],
        action: 'added',
      })
    })
  })
}

/**
 * Ensure each placed clip is composed into the preview compositor. The patched
 * VideoEffect view's on_media_change("added") listener does compositor.recreate
 * but is gated by `!is_effect_already_composed`; clear the effect from the
 * videoManager first so the guard passes, then re-announce the media. Deduped
 * publish per source hash (multiple clips can share one source file).
 *
 * After compositing, nudge a first-frame redraw (openimago-rgtw): omniclip's
 * preview is HTMLVideoElement-based — recreate() builds each <video> and calls
 * compose_effects synchronously, but the <video> has not decoded a frame yet
 * (only element.load() was called), so fabric draws BLACK and nothing ever
 * redraws (the media-player only composes on playhead/playing changes). We wait
 * for the on-screen clip's <video> to become drawable, then re-compose so the
 * first frame paints on open.
 */
function composePlacedClips(placed: { id: string; fileHash: string }[]): void {
  if (placed.length === 0) return
  const ctx = omnislate.context
  const media = ctx.controllers.media
  const videoManager = ctx.controllers.compositor.managers.videoManager
  // Two rAFs: the first lets the state-driven slate render commit, the second
  // ensures the VideoEffect use.mount() listeners are attached before we publish.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Clear composed entries so every view's !is_effect_already_composed passes.
      for (const { id } of placed) {
        videoManager.delete(id)
      }
      // Re-announce each unique source hash → listeners re-compose for playback.
      const seen = new Set<string>()
      for (const { fileHash } of placed) {
        if (seen.has(fileHash)) continue
        seen.add(fileHash)
        const file = media.get(fileHash)
        if (!file) continue
        media.on_media_change.publish({ files: [{ hash: fileHash, file, kind: 'video' }], action: 'added' })
      }
      // The video-effect listener calls compositor.recreate() (async: it awaits
      // media.are_files_ready() before building each <video> + composing), so the
      // <video> elements don't exist in videoManager synchronously after publish.
      // Defer the first-frame nudge one more frame so recreate has built them.
      requestAnimationFrame(() => nudgeFirstFrame())
    })
  })
}

/** HTMLVideoElement.readyState ≥ HAVE_CURRENT_DATA → a frame can be drawImage'd. */
const HAVE_CURRENT_DATA = 2

/**
 * Paint the preview's FIRST frame once the on-screen clip's <video> can be drawn
 * (openimago-rgtw). recreate() composed the canvas while the <video> was still
 * loading, so fabric drew BLACK and nothing redraws (the media-player only
 * composes on playhead/playing changes). We re-run compose_effects + redraw once
 * the visible element reaches a drawable readyState (or its first
 * `seeked`/`loadeddata`), so the frame paints on open without pressing play.
 *
 * NOTE (openimago-ua5d): cover-fit is NO LONGER done here — it now happens at the
 * FabricImage creation point in the VideoManager patch (race-free, per clip, on
 * every recreate). This function only ensures the first frame PAINTS.
 *
 * DETERMINISTIC CONVERGENCE (openimago-sjqt): the first frame previously painted
 * only intermittently. Two races:
 *  1. recreate() is async — it adds the rebuilt FabricImage to the canvas AFTER
 *     this function's single immediate redraw ran, so that redraw composed nothing.
 *  2. omniclip's compose_effects only (re)adds effects in the `add` delta =
 *     (relative effects) − (currently_played_effects). After the fork's
 *     videoManager.delete(id) + recreate rebuilds the FabricImage, the effect id
 *     is STILL in currently_played_effects, so the delta is empty and
 *     #add_effects_to_canvas → add_video_to_canvas is never called → the rebuilt
 *     image is never put on the canvas (only the 2 transparent guideline rects are).
 * Fix: a BOUNDED rAF loop that, each tick, forces the visible video FabricImage
 * onto the canvas (by evicting its id from currently_played_effects when missing,
 * so the next compose_effects re-adds it exactly once — fabric's add does NOT
 * dedupe, so we only evict when actually off-canvas), redraws idempotently, and
 * stops once every visible video is BOTH on the canvas AND drawable (readyState≥2),
 * or after a frame cap so it can never spin forever.
 */
// Final safety budget (ms) for the first-frame nudge. The structural part (force
// the FabricImage onto the canvas) converges in a handful of frames; the long tail
// is waiting for a <video> element to DECODE its first frame (readyState ≥ 2). A
// user-split's freshly-created clip can take well over the old ~3s/180-frame cap to
// reach that — past the cap the loop stopped redrawing, so when the media finally
// became drawable nothing repainted → the split segment showed a BLACK first frame
// (openimago-6imt). We now (a) drive repaints off the element's own
// loadeddata/canplay/seeked events — which fire whenever the media becomes drawable,
// no matter how late — re-attaching to clips that appear after the nudge starts
// (split clips are created asynchronously by recreate()), and (b) keep the rAF loop
// as a generous TIME-budgeted backstop instead of a tight frame cap, so a slow
// decode is no longer abandoned early. The budget only bounds the loop so it can
// never spin forever; convergence (or an event-driven repaint) ends it sooner.
const NUDGE_BUDGET_MS = 15000

export function nudgeFirstFrame(): void {
  const ctx = omnislate.context
  const compositor = ctx.controllers.compositor

  // Ensure the on-screen clip's first frame paints once its <video> is drawable.
  const visible = compositor.get_effects_relative_to_timecode(
    ctx.state.effects,
    compositor.timecode,
  )

  // True once the on-screen video actually has a decoded frame to draw — the point
  // at which a redraw produces a real (non-black) first frame (openimago-ah1j).
  const visibleClipDrawable = (): boolean =>
    visible.some((effect) => {
      if (effect.kind !== 'video') return false
      const fv = compositor.managers.videoManager.get(effect.id)
      const el = fv?.getElement() as HTMLVideoElement | undefined
      return !!el && el.readyState >= HAVE_CURRENT_DATA
    })

  // TEMPORARY DIAGNOSTIC (openimago-qsb5): dump the on-screen video FabricImage's
  // geometry after a redraw so we can tell whether the first frame is drawn but
  // positioned OFF the visible canvas (overflow hypothesis) vs not drawn at all.
  // Logging ONLY — does not affect paint/positioning. Remove once root-caused.
  const logDiag = (): void => {
    const effect = visible.find((e) => e.kind === 'video')
    if (!effect) {
      console.log('[omni-diag] no visible video effect at timecode', compositor.timecode)
      return
    }
    const fabricVideo = compositor.managers.videoManager.get(effect.id) as
      | (Record<string, unknown> & { getElement?: () => HTMLVideoElement })
      | undefined
    const canvas = compositor.canvas as unknown as {
      width?: number
      height?: number
      viewportTransform?: number[]
      lowerCanvasEl?: HTMLCanvasElement
    }
    if (!fabricVideo) {
      console.log('[omni-diag] effect', effect.id, 'has no FabricImage in videoManager', {
        canvasW: canvas.width,
        canvasH: canvas.height,
      })
      return
    }

    const left = Number(fabricVideo.left)
    const top = Number(fabricVideo.top)
    const scaleX = Number(fabricVideo.scaleX)
    const scaleY = Number(fabricVideo.scaleY)
    const width = Number(fabricVideo.width)
    const height = Number(fabricVideo.height)
    const originX = String(fabricVideo.originX)
    const originY = String(fabricVideo.originY)
    const scaledW = width * scaleX
    const scaledH = height * scaleY
    // Origin-aware bounding box: center origin → left/top is the CENTER; otherwise
    // (left/top origin) left/top is the top-left edge.
    const boundingLeft = originX === 'center' ? left - scaledW / 2 : left
    const boundingTop = originY === 'center' ? top - scaledH / 2 : top
    const boundingRight = boundingLeft + scaledW
    const boundingBottom = boundingTop + scaledH

    const el = fabricVideo.getElement?.()
    let centerRGBA: number[] | string = 'n/a'
    try {
      const lower = canvas.lowerCanvasEl
      const cw = Number(canvas.width) || 0
      const ch = Number(canvas.height) || 0
      const lctx = lower?.getContext('2d', { willReadFrequently: true })
      if (lctx && cw > 0 && ch > 0) {
        const px = lctx.getImageData(Math.floor(cw / 2), Math.floor(ch / 2), 1, 1).data
        centerRGBA = [px[0]!, px[1]!, px[2]!, px[3]!]
      }
    } catch (err) {
      centerRGBA = `getImageData failed: ${String(err)}`
    }

    console.log('[omni-diag] first-frame geometry', {
      effectId: effect.id,
      canvas: {
        width: canvas.width,
        height: canvas.height,
        viewportTransform: canvas.viewportTransform,
      },
      object: { left, top, scaleX, scaleY, width, height, originX, originY,
        visible: fabricVideo.visible, opacity: fabricVideo.opacity },
      derivedBoundingBox: { boundingLeft, boundingTop, boundingRight, boundingBottom, scaledW, scaledH },
      withinCanvas:
        boundingLeft >= 0 &&
        boundingTop >= 0 &&
        boundingRight <= (Number(canvas.width) || 0) &&
        boundingBottom <= (Number(canvas.height) || 0),
      element: el
        ? { readyState: el.readyState, videoWidth: el.videoWidth, videoHeight: el.videoHeight, currentTime: el.currentTime }
        : 'no element',
      codeSideCenterRGBA: centerRGBA,
    })
  }

  // The video effects visible at timecode 0 — the ones that must be on the canvas.
  const visibleVideos = visible.filter((e) => e.kind === 'video')

  // True iff the effect's CURRENT FabricImage (from videoManager) is on the canvas.
  const isOnCanvas = (effectId: string): boolean => {
    const fabricVideo = compositor.managers.videoManager.get(effectId)
    if (!fabricVideo) return false
    return compositor.canvas.getObjects().includes(fabricVideo)
  }

  // Force-add the visible video's FabricImage to the canvas when it's missing.
  // omniclip's compose_effects only re-adds effects in its `add` delta =
  // relative − currently_played_effects; after the fork's delete+recreate the id
  // lingers in currently_played_effects so the delta is empty and the rebuilt
  // image is never added. Evicting the id (ONLY when off-canvas) puts it back in
  // the delta so the next compose_effects calls add_video_to_canvas exactly once.
  // Guarded on off-canvas because fabric's canvas.add does not dedupe.
  const ensureOnCanvas = (): void => {
    for (const effect of visibleVideos) {
      if (!isOnCanvas(effect.id)) {
        compositor.currently_played_effects.delete(effect.id)
      }
    }
  }

  const redraw = (): void => {
    ensureOnCanvas()
    const effects = ctx.state.effects
    compositor.compose_effects(effects, compositor.timecode)
    compositor.set_current_time_of_audio_or_video_and_redraw(true, compositor.timecode)
    compositor.canvas.requestRenderAll()
    if (import.meta.env.DEV) logDiag()
    // Log time-to-first-paint exactly once, when this redraw actually puts clip 0's
    // decoded frame on the canvas (not the earlier black/loading redraws).
    if (
      import.meta.env.DEV &&
      !firstPaintLogged &&
      firstPaintStart !== null &&
      visibleClipDrawable()
    ) {
      firstPaintLogged = true
      const ms = Math.round(performance.now() - firstPaintStart)
      console.log(`[omniclip-fork] time-to-first-paint: ${ms}ms`)
    }
  }

  // Converged once EVERY visible video is on the canvas AND its element is drawable.
  // If there are no visible videos, there is nothing to paint → treat as converged.
  const converged = (): boolean =>
    visibleVideos.every((effect) => {
      if (!isOnCanvas(effect.id)) return false
      const fv = compositor.managers.videoManager.get(effect.id)
      const el = fv?.getElement() as HTMLVideoElement | undefined
      return !!el && el.readyState >= HAVE_CURRENT_DATA
    })

  // Media-ready listeners drive a repaint WHENEVER a clip's <video> becomes
  // drawable — independent of the rAF loop and surviving past its budget. A user
  // split's new clip is built asynchronously (recreate awaits media), so its
  // element may not exist when the nudge starts AND may decode well after any frame
  // cap; firing on its own loadeddata/canplay/seeked guarantees the first frame
  // paints whenever it lands, no matter how late (openimago-6imt). We (re-)scan the
  // visible videos each rAF tick and attach to any not-yet-listened element, using
  // a WeakSet so each element is wired exactly once.
  const wired = new WeakSet<HTMLVideoElement>()
  const drawableEvents: Array<keyof HTMLVideoElementEventMap> = [
    'loadeddata',
    'canplay',
    'seeked',
  ]
  const attachReadyListeners = (): void => {
    for (const effect of visibleVideos) {
      const fabricVideo = compositor.managers.videoManager.get(effect.id)
      const element = fabricVideo?.getElement() as HTMLVideoElement | undefined
      if (!element || wired.has(element)) continue
      if (element.readyState >= HAVE_CURRENT_DATA) continue // already drawable
      wired.add(element)
      // A split clip emits loadeddata → (after the seek to its inPoint) seeked;
      // redraw is idempotent so repainting on each is harmless. Detach once the
      // element is drawable AND on the canvas — the first-frame goal is met, and we
      // must not keep repainting on every later `seeked` (playhead scrubs).
      const onReady = (): void => {
        redraw()
        if (element.readyState >= HAVE_CURRENT_DATA && isOnCanvas(effect.id)) {
          for (const evt of drawableEvents) element.removeEventListener(evt, onReady)
        }
      }
      for (const evt of drawableEvents) element.addEventListener(evt, onReady)
    }
  }

  // rAF retry: redraw (force-adding the image when off-canvas) each frame until
  // convergence, then stop. The TIME budget (not a tight frame cap) guarantees
  // termination even if a <video> never decodes (e.g. Orca's embedded browser,
  // which can't rasterize video — there the structural "image on canvas" invariant
  // still converges). The media-ready listeners attached above outlive this loop,
  // so a slow decode that finishes after the budget still triggers a repaint.
  const start = performance.now()
  let frame = 0
  const tick = (): void => {
    attachReadyListeners()
    redraw()
    frame++
    if (converged()) {
      if (import.meta.env.DEV) {
        console.log(`[omni-diag] nudgeFirstFrame converged after ${frame} frame(s)`)
      }
      return
    }
    if (performance.now() - start >= NUDGE_BUDGET_MS) {
      if (import.meta.env.DEV) {
        const onCanvas = visibleVideos.filter((e) => isOnCanvas(e.id)).length
        console.log(
          `[omni-diag] nudgeFirstFrame rAF budget elapsed after ${frame} frames; ` +
            `media-ready listeners remain armed for late decode`,
          { visibleVideos: visibleVideos.length, onCanvas },
        )
      }
      return
    }
    requestAnimationFrame(tick)
  }
  tick()
}
