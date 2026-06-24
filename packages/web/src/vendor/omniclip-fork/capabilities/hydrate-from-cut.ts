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
import type { HydrateClip, ImportedMedia, OmniTransition } from 'src/utils/cut/fork-contract'

const MS_PER_S = 1000

// Time-to-first-paint instrumentation (DEV-only, openimago-ah1j). Set when a
// hydrate begins; consumed once by the first nudgeFirstFrame redraw so we can
// measure the open → clip-0-frame-painted latency the parallelization targets.
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

  if (clips.length === 0) {
    resetTransitions()
    if (import.meta.env.DEV) console.timeEnd('[omniclip-fork] hydrateFromCut total')
    return
  }

  // Place a single already-imported clip at the given cursor and record it.
  // Returns the clip's duration (ms) so the caller can advance the cursor — clip
  // placement order + cursorMs must stay EXACT (transitions key off the clip they
  // follow, openimago-ah1j).
  const placeClip = (clip: HydrateClip, imported: ImportedMedia, cursorMs: number): number => {
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
    return durationMs
  }

  // EARLY FIRST FRAME (openimago-ah1j): import + place clip 0 BY ITSELF first, then
  // paint its first frame immediately — so the on-screen frame no longer waits on
  // the whole serial import of all N clips (previously sum(import); now ≈ clip 0's
  // own import). Kick off the remaining imports in PARALLEL before awaiting clip 0
  // so they overlap clip 0's import and each other (wall time → ≈max(import)).
  const [firstClip, ...restClips] = clips
  // Start clip 0's import FIRST so it enters the serialized ffprobe queue ahead of
  // the rest — otherwise clip 0's frame-probe could wait behind the others and
  // defeat the early-paint. Then start the remaining imports so they run in
  // parallel with clip 0 and each other.
  const firstImport = importFromUrl(firstClip.url, { name: firstClip.name })
  const restImports = restClips.map((clip) =>
    importFromUrl(clip.url, { name: clip.name }),
  )
  // Observe rest-import rejections eagerly so that if clip 0's import throws below
  // (before we await Promise.all), the in-flight rest promises don't surface as
  // unhandled rejections. The real value is still awaited via restAll, which keeps
  // the original "any import failure fails hydrate" semantics.
  const restAll = Promise.all(restImports)
  restAll.catch(() => {})

  // Await + place the on-screen clip's media (fetch → File → omniclip hash/IDB).
  const firstImported = await firstImport
  let cursorMs = placeClip(firstClip, firstImported, 0)
  // Paint clip 0's first frame as soon as it is placed + drawable, without waiting
  // for the rest of the batch or transitions.
  composePlacedClips([{ id: firstClip.id, fileHash: firstImported.fileHash }])

  // Place the remaining clips in ORIGINAL order once their parallel imports resolve,
  // accumulating cursorMs exactly. Promise.all preserves array order regardless of
  // which import finishes first, and rethrows the first failure (fails hydrate).
  const restImported = await restAll
  restClips.forEach((clip, i) => {
    cursorMs += placeClip(clip, restImported[i]!, cursorMs)
  })

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

  if (import.meta.env.DEV) console.timeEnd('[omniclip-fork] hydrateFromCut total')
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
 */
function nudgeFirstFrame(): void {
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

  const redraw = (): void => {
    const effects = ctx.state.effects
    compositor.compose_effects(effects, compositor.timecode)
    compositor.set_current_time_of_audio_or_video_and_redraw(true, compositor.timecode)
    compositor.canvas.requestRenderAll()
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

  // Always do an immediate redraw too: drawable elements paint now, and late
  // `loadeddata`/`seeked` listeners repaint the rest as they decode.
  redraw()
}
