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
// IMPORT ORDERING (openimago-0if6 / openimago-ns5o): media import is now TWO-PHASE
// — (A) import each UNIQUE source url ONCE in PARALLEL (Promise.all), then (B) place
// the effects synchronously in clip order. The old loop imported serially AND
// re-imported the same source per clip, so an N-clip cut (with a source split into
// k halves) paid roughly Σ of every clip's fetch+decode → ~17.6s first paint; the
// two-phase form collapses it to ≈ the slowest single source (openimago-ns5o).
//
// CRITICAL — this does NOT reintroduce the openimago-0if6 regression: the compose
// stays FIRE-AND-FORGET (composePlacedClips is never awaited). That regression was
// caused by openimago-ac52 AWAITING clip 0's first-paint/drawable signal before
// importing the rest — on a normal tab-open that signal never fired, so the await
// left the canvas blank (all 0,0,0,0). We only parallelize the IMPORTS (which
// importFromUrl was already built to do safely — the shared FFprobeWorker is mutexed,
// openimago-ah1j); we never await a paint signal. DEV timing logs are kept
// (non-blocking) so first-paint can still be measured on the real flow.

import { omnislate } from '../upstream/context/context'
import { importFromUrl } from './import-from-url'
import { setTransition, resetTransitions } from './transitions'
import type {
  HydrateBgm,
  HydrateClip,
  ImportedMedia,
  OmniTransition,
} from 'src/utils/cut/fork-contract'

const MS_PER_S = 1000

// PREVIEW COMPOSITION (openimago-74y8): the editor boots from the VENDORED 1.1.3
// source, whose native VideoEffect / AudioEffect views already carry the compose
// contract — each mounts an `media.on_media_change("added")` listener that, gated by
// `!is_effect_already_composed` (videoManager/audioManager.get(effect.id)), calls
// `compositor.recreate({...state, effects:[effect], ...}, media)`. So the fork does
// NOT re-implement composition: it RE-ANNOUNCES the media after the effect views
// mount (importFromUrl publishes "added" before the view exists, so the mounted
// listener misses it) and lets the native listener recreate onto the pixi stage.
// pixi's Application renders via its ticker and the VideoManager owns the sprite's
// VideoResource texture, so the elaborate fabric first-frame nudge (canvas.getObjects/
// requestRenderAll/set_current_time_..._and_redraw — all removed in 1.1.3) is gone;
// a single compose_effects() at the current timecode is the only paint poke needed.

/** Default rect — clips fill the portrait 9:16 frame (openimago-vm5v); trimming
 * is via start/end. Matches the 1080×1920 project resolution set at boot.
 * `pivot` is REQUIRED by 1.1.3's EffectRect — the pixi VideoManager reads
 * effect.rect.pivot.x/y when building the sprite (openimago-lpjd); omitting it
 * (the 1.0.7 fabric shape) would crash sprite creation. */
function fullFrameRect() {
  return {
    width: 1080,
    height: 1920,
    scaleX: 1,
    scaleY: 1,
    position_on_canvas: { x: 0, y: 0 },
    rotation: 0,
    pivot: { x: 0, y: 0 },
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
  }

  // (effectId, fileHash) per placed clip — the filmstrip refresh needs both: the
  // effect id to clear from the compositor's videoManager, the hash to re-announce.
  const placed: { id: string; fileHash: string }[] = []

  // ── PHASE A: import each UNIQUE source url ONCE, in PARALLEL (openimago-ns5o) ──
  //
  // The old loop awaited importFromUrl serially AND re-imported the same url for
  // every clip — so an N-clip cut paid N × (fetch + WebCodecs decode), and a source
  // split into k halves was decoded k times (e.g. s01 imported 4×) → ~17.6s first
  // paint. Media in omniclip is shared by content-hash, so one import per source is
  // sufficient for any number of effects on it. Dedup by url BEFORE the parallel
  // import so the same url is never imported twice concurrently (which would double
  // the IndexedDB write + decode). importFromUrl is already concurrency-safe — the
  // shared FFprobeWorker is mutexed (openimago-ah1j) — so Promise.all collapses the
  // total to roughly the SLOWEST single source instead of their sum.
  const uniqueUrls = [...new Set(clips.map((c) => c.url))]
  const importedByUrl = new Map<string, ImportedMedia>()
  await Promise.all(
    uniqueUrls.map(async (url) => {
      // All clips sharing a url share a source shot → the same name; take the first.
      const name = clips.find((c) => c.url === url)?.name
      importedByUrl.set(url, await importFromUrl(url, { name }))
    }),
  )

  // ── PHASE B: place the video effects in the clips' ORIGINAL order ──
  // Synchronous now that every source is imported — keeps cursorMs flush placement,
  // per-clip filmstrip_* mounting, and 1:1 clip-id → effect-id. Multiple effects
  // sharing one fileHash is correct (composePlacedClips dedups compose per hash).
  let cursorMs = 0
  for (const clip of clips) {
    const imported = importedByUrl.get(clip.url)
    if (!imported) continue // import failed for this source — skip (defensive)
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

  // Re-announce so the (now-mounted) native AudioEffect view composes its waveform.
  // importFromUrl publishes on_media_change("added") BEFORE add_audio_effect mounts
  // the view, so the mounted listener (gated by !audioManager.get(id)) misses it —
  // clear the audioManager entry, then re-publish the AnyMedia record so the gate
  // passes and the native view runs wave.on_file_found + compositor.recreate
  // (upstream/components/omni-timeline/views/effects/audio-effect.ts).
  const media = ctx.controllers.media
  const audioManager = ctx.controllers.compositor.managers.audioManager
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      audioManager.delete(bgm.id)
      // 1.1.3's media is a Map<hash, AnyMedia>; get() returns the full record (with
      // .file), which is exactly the on_media_change payload shape (the listener
      // reads .hash off it).
      const record = media.get(imported.fileHash)
      if (!record) return
      media.on_media_change.publish({ files: [record], action: 'added' })
    })
  })
}

/**
 * Re-announce each placed clip's media so the NATIVE 1.1.3 VideoEffect view composes
 * it onto the pixi stage. importFromUrl publishes on_media_change("added") while it
 * imports — BEFORE add_video_effect mounts the effect view — so the view's own mounted
 * listener (upstream/.../effects/video-effect.ts, gated by
 * `!compositor.managers.videoManager.get(effect.id)`) misses that first publish. We
 * wait for the views to mount (two rAFs), clear each placed id from the videoManager so
 * the gate re-opens, then re-publish each unique source record — the native listener
 * then runs `compositor.recreate({...state, effects:[effect], filters}, media)`.
 * Fire-and-forget (never awaited — openimago-0if6): recreate is async; we do not block
 * hydrate on it.
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
      // Clear composed entries so every native view's !is_effect_already_composed passes.
      for (const { id } of placed) {
        videoManager.delete(id)
      }
      // Re-announce each unique source hash → the native listeners recreate. The
      // 1.1.3 Media Map stores AnyMedia records; get(hash) returns the record (the
      // listener reads .hash off it), so publish the record directly.
      const seen = new Set<string>()
      for (const { fileHash } of placed) {
        if (seen.has(fileHash)) continue
        seen.add(fileHash)
        const record = media.get(fileHash)
        if (!record) continue
        media.on_media_change.publish({ files: [record], action: 'added' })
      }
      // recreate() is async (awaits media.are_files_ready() + builds the pixi sprites),
      // so defer one more frame, then poke a single paint at the current timecode.
      requestAnimationFrame(() => nudgeFirstFrame())
    })
  })
}

/**
 * Poke a single paint of the composed scene at the current timecode (openimago-74y8).
 *
 * On 1.1.3's PIXI compositor the elaborate fabric first-frame machinery is gone: the
 * native VideoEffect listener already ran `compositor.recreate(...)` (which builds the
 * sprites and adds them to the stage), the VideoManager owns each sprite's VideoResource
 * texture, and PIXI's Application renders via its ticker. So a single
 * `compose_effects(state.effects, timecode)` — which updates the currently-played set
 * and calls `app.render()` — is all that is needed to surface the first frame without
 * pressing play. `compose_effects` no-ops until the compositor has been recreated at
 * least once (its `#recreated` guard), which is exactly the post-recreate state we are
 * in. Also called by on-edit.ts after a split for the same single-poke repaint.
 *
 * NOTE: first-frame paint is a BROWSER-ONLY behavior — validate locally (the pure logic
 * is elsewhere). If a trimmed clip's in-point frame needs an explicit seek, that is a
 * follow-up (compositor.seek skips the per-effect currentTime set at timecode 0).
 */
export function nudgeFirstFrame(): void {
  const ctx = omnislate.context
  const compositor = ctx.controllers.compositor
  compositor.compose_effects(ctx.state.effects, compositor.timecode)
}
