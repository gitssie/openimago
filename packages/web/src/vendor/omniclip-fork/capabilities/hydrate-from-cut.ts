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

  // Filmstrip refresh (openimago-vwjl). The per-clip frame strip is drawn ONLY by
  // the VideoEffect view's on_media_change("added") listener, which runs
  // filmstrip.on_file_found() → recalculate_filmstrip_frames(true). Two reasons
  // it never fired for our clips:
  //   (a) we publish "added" INSIDE importFromUrl, BEFORE add_video_effect mounts
  //       the view → the listener (subscribed at mount) misses that event; and
  //   (b) the listener is guarded by `!is_effect_already_composed`
  //       (compositor.managers.videoManager.get(effect.id)) — and by the time a
  //       later re-publish lands, the compositor has already composed all effects,
  //       so the guard blocks every redraw (confirmed by e2e: childCount 0).
  // Fix: after the views have mounted, DELETE each effect from the videoManager
  // (so its guard passes), then re-publish "added". The listener then re-inits the
  // filmstrip (get_file now resolves — Part 1) and re-composes the effect via
  // compositor.recreate, so the un-compose is self-healing. Fire-and-forget; we
  // never await on_media_change (no 60s event-timeout regression, per 1mcb).
  refreshFilmstrips(placed)
}

/**
 * Force each placed clip's VideoEffect view to (re)draw its filmstrip. The view's
 * on_media_change("added") listener owns the only reliable strip draw but is
 * gated by `!is_effect_already_composed`; we clear the effect from the
 * compositor's videoManager first so that guard passes, then re-announce the
 * media. The listener's own compositor.recreate re-composes the effect. Deduped
 * publish per hash (multiple effects can share one source file).
 */
function refreshFilmstrips(placed: { id: string; fileHash: string }[]): void {
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
      // Re-announce each unique source hash → listeners re-init + redraw the strip.
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
