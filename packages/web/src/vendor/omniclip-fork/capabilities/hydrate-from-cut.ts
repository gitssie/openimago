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
import type { HydrateClip, OmniTransition } from 'src/utils/cut/fork-contract'

const MS_PER_S = 1000

/** Default rect — clips fill the frame; trimming is via start/end. */
function fullFrameRect() {
  return {
    width: 1920,
    height: 1080,
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
      // TRUE clip length in SECONDS (from the cut model's in/out points) — the
      // reliable basis for "one cell per second" in the static sprite view
      // (openimago-78m9); avoids omniclip's internal-unit duration / 2^zoom math.
      filmstrip_duration_seconds: clip.outPointSeconds - clip.inPointSeconds,
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
    })
  })
}
