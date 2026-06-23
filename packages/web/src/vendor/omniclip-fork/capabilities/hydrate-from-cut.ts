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

  const importedHashes: string[] = []

  let cursorMs = 0
  for (const clip of clips) {
    // Import the clip's media (fetch → File → omniclip content-hash/IndexedDB).
    const imported = await importFromUrl(clip.url, { name: clip.name })
    importedHashes.push(imported.fileHash)

    const startMs = clip.inPointSeconds * MS_PER_S
    const endMs = clip.outPointSeconds * MS_PER_S
    const durationMs = endMs - startMs

    // Place a video effect for this clip and trim/position it to match the cut.
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

  // Filmstrip refresh (openimago-vwjl). Each VideoEffect view subscribes (on
  // mount) to media.on_media_change and, for an "added" event matching its
  // file_hash on an as-yet-uncomposed effect, runs filmstrip.on_file_found() →
  // recalculate_filmstrip_frames(true) — the ONLY reliable path that draws the
  // per-clip frame strip (the constructor's eager recalc races the async frame
  // init and yields nothing). We publish "added" INSIDE importFromUrl, but that
  // is BEFORE add_video_effect mounts the view, so those events are missed.
  // Re-publish here AFTER the effects are placed; a rAF lets the slate/Lit views
  // mount + subscribe first. Effects added via actions.add_video_effect are not
  // yet in the compositor's videoManager, so each listener's
  // !is_effect_already_composed guard passes and the strip regenerates. Fire and
  // forget — we never await on_media_change (no event-timeout, per 1mcb).
  refreshFilmstrips(importedHashes)
}

/**
 * Re-publish media.on_media_change("added") for the given hashes after a frame,
 * so the now-mounted VideoEffect views regenerate their filmstrips. Deduped so a
 * clip reused across the cut only re-emits once.
 */
function refreshFilmstrips(hashes: string[]): void {
  const unique = [...new Set(hashes)]
  if (unique.length === 0) return
  const media = omnislate.context.controllers.media
  // Two rAFs: the first lets the state-driven slate render commit, the second
  // ensures the VideoEffect use.mount() listeners are attached before we publish.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      for (const hash of unique) {
        const file = media.get(hash)
        if (!file) continue
        media.on_media_change.publish({ files: [{ hash, file, kind: 'video' }], action: 'added' })
      }
    })
  })
}
