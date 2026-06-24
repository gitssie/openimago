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

import { omnislate } from 'omniclip/x/context/context.js'
import { importFromUrl } from './import-from-url'
import { setTransition, resetTransitions } from './transitions'
import { coverScaleRect } from 'src/utils/cut/cover-scale'
import type { HydrateClip, OmniTransition } from 'src/utils/cut/fork-contract'

const MS_PER_S = 1000

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
): Promise<void> {
  const ctx = omnislate.context
  ctx.actions.remove_all_effects()

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
    // Filmstrip cell count = ceil(seconds), so compute a FINITE, POSITIVE seconds
    // value here (openimago-78m9): the trimmed length, else the imported clip's raw
    // duration, else 1 — so a clip with a missing/0 trim still renders ≥1 cell
    // (its first frame) instead of an empty strip.
    const trimmedSeconds = (endMs - startMs) / MS_PER_S
    const filmstripDurationSeconds =
      Number.isFinite(trimmedSeconds) && trimmedSeconds > 0
        ? trimmedSeconds
        : imported.rawDurationSeconds > 0
          ? imported.rawDurationSeconds
          : 1

    // Place a video effect for this clip and trim/position it to match the cut.
    // The filmstrip_* fields are custom extras carried on the effect (omniclip
    // stores arbitrary fields in state); the patched video-effect view reads them
    // to render the precomputed sprite statically (openimago-78m9) — no WebCodecs.
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
      filmstrip_url: clip.filmstripUrl ?? null,
      filmstrip_frame_count: clip.filmstripFrameCount ?? null,
      filmstrip_frame_w: clip.filmstripFrameW ?? null,
      filmstrip_frame_h: clip.filmstripFrameH ?? null,
      // TRUE clip length in SECONDS (guarded finite>0) — the reliable basis for
      // "one cell per second" in the static sprite view (openimago-78m9); avoids
      // omniclip's internal-unit duration / 2^zoom math, and never NaN/0 (which
      // would render an empty strip).
      filmstrip_duration_seconds: filmstripDurationSeconds,
      // Real SOURCE video duration (s): the sprite spans the full source, so the
      // filmstrip maps a cell's source time (inPoint + i*sec/cell) → sprite frame
      // against THIS — making a clip show its inPoint-onward frames, and split
      // halves visually distinct (openimago-px5g). null → falls back to clip dur.
      filmstrip_source_duration_seconds: clip.filmstripSourceDurationSeconds ?? null,
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

  // Compose the placed clips into the WebCodecs PREVIEW compositor (openimago-vwjl,
  // refined for 78m9). The patched VideoEffect view composes a clip in its
  // on_media_change("added") listener, but we publish "added" INSIDE importFromUrl
  // — BEFORE add_video_effect mounts the view — so the mounted listener misses it.
  // Re-publish after the views mount so each composes. The listener is gated by
  // `!is_effect_already_composed`, so first DELETE each effect from the
  // videoManager (the guard then passes) and re-announce. NOTE: with the static
  // sprite filmstrip (78m9) this no longer drives any thumbnail drawing — it ONLY
  // ensures playback composition; the timeline strip renders from the precomputed
  // sprite with no events. Fire-and-forget (no on_media_change await; per 1mcb).
  composePlacedClips(placed)
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

/** Canvas (project) size — source of truth is state.settings, else the fabric canvas. */
function canvasSize(): { w: number; h: number } {
  const ctx = omnislate.context
  const settings = ctx.state?.settings as { width?: number; height?: number } | undefined
  const canvas = ctx.controllers.compositor.canvas
  const w = settings?.width || canvas.getWidth?.() || canvas.width || 0
  const h = settings?.height || canvas.getHeight?.() || canvas.height || 0
  return { w, h }
}

/**
 * Cover-fit one clip's FabricImage to the canvas (openimago-kzb3): fabric draws
 * the <video> at its INTRINSIC size × scale at (left, top), so a 720×1280 video
 * sits small in the top-left of the 1080×1920 canvas. Scale it up to COVER the
 * canvas (uniform, crop overflow) and center it, then write the transform back to
 * effect.rect so state stays consistent. Needs the element's videoWidth/Height,
 * available once metadata has loaded; a 0-dimension element is skipped.
 */
function coverFitEffect(effect: { id: string; rect?: Record<string, unknown> }): void {
  const compositor = omnislate.context.controllers.compositor
  const fabricVideo = compositor.managers.videoManager.get(effect.id)
  const element = fabricVideo?.getElement() as HTMLVideoElement | undefined
  if (!fabricVideo || !element) return
  const videoW = element.videoWidth
  const videoH = element.videoHeight
  if (!videoW || !videoH) return
  const { w: canvasW, h: canvasH } = canvasSize()
  const { scaleX, scaleY, left, top } = coverScaleRect(canvasW, canvasH, videoW, videoH)
  fabricVideo.set({ scaleX, scaleY, left, top })
  fabricVideo.setCoords?.()
  // Keep state's rect in sync so undo/redo + re-compose preserve the fit.
  if (effect.rect) {
    effect.rect.scaleX = scaleX
    effect.rect.scaleY = scaleY
    effect.rect.position_on_canvas = { x: left, y: top }
  }
}

/**
 * Paint the preview's FIRST frame once the on-screen clip's <video> can be drawn
 * (openimago-rgtw), scaled to COVER the portrait canvas (openimago-kzb3).
 * recreate() composed the canvas while the <video> was still loading (black) AND
 * at intrinsic size in the top-left. We cover-fit each clip then re-run
 * compose_effects + redraw once the element reaches a drawable readyState (or its
 * first `seeked`/`loadeddata`), so the frame paints, filled and centered, without
 * waiting for the user to press play. Best-effort: missing elements are skipped.
 */
function nudgeFirstFrame(): void {
  const ctx = omnislate.context
  const compositor = ctx.controllers.compositor

  const redraw = (): void => {
    const effects = ctx.state.effects
    // Cover-fit every visible clip BEFORE composing so the scaled frame paints.
    for (const effect of compositor.get_effects_relative_to_timecode(effects, compositor.timecode)) {
      if (effect.kind === 'video') coverFitEffect(effect)
    }
    // Re-run the compose pass (adds the now-decoded <video> frame to the canvas),
    // then seek each visible element to its in-point and request a render.
    compositor.compose_effects(effects, compositor.timecode)
    compositor.set_current_time_of_audio_or_video_and_redraw(true, compositor.timecode)
    compositor.canvas.requestRenderAll()
  }

  // The effects relative to the current timecode are the ones drawn on canvas.
  const visible = compositor.get_effects_relative_to_timecode(
    ctx.state.effects,
    compositor.timecode,
  )
  if (visible.length === 0) {
    redraw()
    return
  }

  for (const effect of visible) {
    if (effect.kind !== 'video') continue
    const fabricVideo = compositor.managers.videoManager.get(effect.id)
    const element = fabricVideo?.getElement() as HTMLVideoElement | undefined
    if (!element) continue
    if (element.readyState >= HAVE_CURRENT_DATA) continue // already drawable
    const onReady = (): void => {
      element.removeEventListener('loadeddata', onReady)
      element.removeEventListener('seeked', onReady)
      redraw()
    }
    element.addEventListener('loadeddata', onReady, { once: true })
    element.addEventListener('seeked', onReady, { once: true })
  }

  // Always do an immediate redraw too: elements already drawable cover-fit + paint
  // now, and late `loadeddata`/`seeked` listeners repaint the rest as they decode.
  redraw()
}
