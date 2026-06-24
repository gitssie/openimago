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

  // EARLY FIRST FRAME, decode-contention-free (openimago-ah1j → ac52). e2e showed
  // that importing the 4 rest clips in parallel WITH clip 0 floods Chrome's media
  // pipeline: each rest import spawns 2 decoding <video> elements (thumbnail seek +
  // duration metadata), ~8 concurrent decodes that starve clip 0's preview <video>
  // for ~2.8s. So we now strictly SEQUENCE: import + place + compose clip 0, AWAIT
  // its first paint (its preview <video> reaching readyState ≥ 2), and only THEN
  // start the rest-clip imports — giving clip 0's decode an uncontended slot. The
  // rest still import in parallel among themselves; total hydrate rises modestly
  // (rest starts after clip 0 paints) — an accepted trade for a fast first frame.
  const [firstClip, ...restClips] = clips

  // Import + place the on-screen clip's media (fetch → File → omniclip hash/IDB).
  const firstImported = await importFromUrl(firstClip.url, { name: firstClip.name })
  let cursorMs = placeClip(firstClip, firstImported, 0)
  // Paint clip 0's first frame and WAIT for it to actually become drawable before
  // unleashing the rest imports' <video> decodes. composePlacedClips resolves when
  // nudgeFirstFrame's drawable signal fires (capped by FIRST_PAINT_WAIT_TIMEOUT_MS
  // so a stuck decode can't hang hydrate).
  await composePlacedClips([{ id: firstClip.id, fileHash: firstImported.fileHash }])

  // NOW start the remaining imports in parallel (among themselves). They run after
  // clip 0 has painted, so their thumbnail/duration <video> decodes no longer
  // contend with clip 0's preview decode.
  const restImports = restClips.map((clip) =>
    importFromUrl(clip.url, { name: clip.name }),
  )
  // Observe rejections eagerly so an early failure doesn't surface as an unhandled
  // rejection before we await; restAll still rethrows the first failure (preserving
  // "any import failure fails hydrate" that StoryCutPanel relies on).
  const restAll = Promise.all(restImports)
  restAll.catch(() => {})

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
  // (Its TTFP log is a no-op here — firstPaintLogged was already set by clip 0.)
  void composePlacedClips(placed)

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
function composePlacedClips(placed: { id: string; fileHash: string }[]): Promise<void> {
  if (placed.length === 0) return Promise.resolve()
  const ctx = omnislate.context
  const media = ctx.controllers.media
  const videoManager = ctx.controllers.compositor.managers.videoManager
  // Resolves once the on-screen clip's first frame has painted (via nudgeFirstFrame)
  // so the caller can sequence the rest-clip imports after it (openimago-ac52).
  return new Promise<void>((resolve) => {
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
        requestAnimationFrame(() => {
          nudgeFirstFrame().then(resolve, resolve)
        })
      })
    })
  })
}

/** HTMLVideoElement.readyState ≥ HAVE_CURRENT_DATA → a frame can be drawImage'd. */
const HAVE_CURRENT_DATA = 2

/**
 * Max time the rest-clip imports wait for clip 0's first paint before proceeding
 * anyway (openimago-ac52). Clip 0's uncontended decode is typically a few hundred
 * ms; this cap only guards a stuck/errored decode so hydrate never hangs.
 */
const FIRST_PAINT_WAIT_TIMEOUT_MS = 2000

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
 * Returns a promise that resolves once the on-screen clip's <video> is drawable
 * (readyState ≥ HAVE_CURRENT_DATA) and its frame has been redrawn — i.e. the first
 * paint actually happened (openimago-ac52). The caller awaits this to hold off the
 * rest-clip imports (each spawns 2 decoding <video> elements) until clip 0's
 * preview video has had an uncontended decode slot, killing the ~2.8s starvation.
 */
function nudgeFirstFrame(): Promise<void> {
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

  return new Promise<void>((resolve) => {
    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      resolve()
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
        done() // clip 0's frame just painted → unblock the rest-clip imports
      }
      element.addEventListener('loadeddata', onReady, { once: true })
      element.addEventListener('seeked', onReady, { once: true })
    }

    // Always do an immediate redraw too: drawable elements paint now, and late
    // `loadeddata`/`seeked` listeners repaint the rest as they decode.
    redraw()
    // If the on-screen clip is already drawable, the first paint is done now.
    if (visibleClipDrawable()) done()

    // Safety net: never block hydrate forever if the <video> never reaches a
    // drawable state (decode error, no visible video clip). Proceed after a short
    // grace period so the rest-clip imports still run (openimago-ac52).
    setTimeout(done, FIRST_PAINT_WAIT_TIMEOUT_MS)
  })
}
