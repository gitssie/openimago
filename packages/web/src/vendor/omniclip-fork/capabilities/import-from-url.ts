// importFromUrl — programmatic media import (openimago-uyd0 → fixed 1mcb).
//
// omniclip 1.0.7's Media.import_file(input) only works from a real <input>
// change and emits on_media_change("added") only for non-duplicates — so a
// synthetic-input import never reliably resolves (the prior approach awaited an
// event that doesn't fire for programmatic adds → 60s timeout). (openimago-1mcb)
//
// This drives the import DETERMINISTICALLY, replicating import_file's effect
// without depending on its event: fetch → Blob → File → quick_hash → ffprobe
// frames → write to omniclip's "database" IndexedDB store (same shape
// import_file writes) → media.set(hash, file) (the controller is a Map) →
// publish on_media_change("added") so omniclip's OWN listeners (video-effect
// filmstrip, compositor, omni-media panel) compose the clip → resolve with the
// facts we computed. We never await on_media_change ourselves.
//
// BROWSER-ONLY: needs fetch + IndexedDB + ffprobe-wasm + WebCodecs.

import { omnislate } from 'omniclip/x/context/context.js'
import { quick_hash } from '@benev/construct'
import { FFprobeWorker } from 'ffprobe-wasm/browser.mjs'
import type { ImportFromUrl, ImportedMedia } from 'src/utils/cut/fork-contract'
import { fileNameFromUrl, omniMediaKindFromType } from 'src/utils/cut/fork-logic'

const ffprobe = new FFprobeWorker()

// Serialize access to the SINGLE shared FFprobeWorker (openimago-ah1j). When
// hydrate imports N clips concurrently, parallel getFrames() calls on one worker
// interleave their postMessage/onmessage round-trips and can return the wrong
// clip's frame count (or hang). fetch/blob/hash/IndexedDB stay parallel — only
// this one shared-worker call funnels through a promise-chain mutex. media.set /
// on_media_change are synchronous; get_imported_files is idempotent + reloads the
// whole store, so neither needs a lock.
let ffprobeChain: Promise<unknown> = Promise.resolve()
function probeFramesSerialized(file: File): Promise<number> {
  const run = ffprobeChain.then(async () => (await ffprobe.getFrames(file, 1))?.nb_frames ?? 0)
  // Keep the chain alive even if one probe rejects, so a single failure doesn't
  // wedge every later import behind a rejected promise.
  ffprobeChain = run.catch(() => undefined)
  return run
}

type OmniMediaKind = 'video' | 'image' | 'audio'

interface AddedMediaRecord {
  hash: string
  file: File
  kind: OmniMediaKind
  frames?: number
}

/** Open omniclip's media IndexedDB ("database" store "files", keyPath "hash"). */
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open('database', 3)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    // If omniclip already ran onupgradeneeded the store exists; we don't create
    // it here (avoids version conflicts) — import_file owns the schema.
  })
}

/** True if the hash is already stored (mirrors import_file's dedupe). */
function hasFile(db: IDBDatabase, hash: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const count = db.transaction(['files']).objectStore('files').count(hash)
      count.onsuccess = () => resolve(count.result > 0)
      count.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/** Persist the media record into the "files" store (same shape as import_file). */
function putFile(db: IDBDatabase, record: AddedMediaRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['files'], 'readwrite')
    tx.objectStore('files').add(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
  })
}

export const importFromUrl: ImportFromUrl = async (url, options) => {
  const name = fileNameFromUrl(url, options?.name)
  // DEV-gated per-clip timing so hydrate's parallelization win is measurable
  // (openimago-ah1j). Unique label per call so concurrent imports don't collide.
  const timeLabel = `[omniclip-fork] importFromUrl ${name}`
  if (import.meta.env.DEV) console.time(timeLabel)
  try {
    const res = await fetch(url, options?.signal ? { signal: options.signal } : undefined)
    if (!res.ok) {
      throw new Error(`importFromUrl: fetch failed for ${url} (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const kind = omniMediaKindFromType(res.headers.get('content-type') ?? blob.type, name)
    if (!kind) throw new Error(`importFromUrl: unsupported media type for ${url}`)

    // Ensure the File carries a concrete type so downstream `startsWith` branches.
    const typedBlob = blob.type ? blob : blob.slice(0, blob.size, `${kind}/*`)
    const file = new File([typedBlob], name, { type: typedBlob.type || `${kind}/*` })

    // Content hash (omniclip keys media by this) + frame count for video. ffprobe
    // runs through a mutex (single shared worker) so concurrent hydrate imports
    // don't corrupt each other's frame count (openimago-ah1j).
    const hash: string = await quick_hash(file)
    const frames = kind === 'video' ? await probeFramesSerialized(file) : 0

    const media = omnislate.context.controllers.media
    const record: AddedMediaRecord = { hash, file, kind, frames }

    // Persist to IndexedDB (skip if duplicate, like import_file) + register in the
    // controller's in-memory Map so get_file(hash) resolves immediately.
    const db = await openMediaDb()
    if (!(await hasFile(db, hash))) {
      await putFile(db, record)
    }
    media.set(hash, file)

    // CRITICAL (openimago-vwjl): flip the controller's private #files_ready flag.
    // Media.get_file(hash) — used by the per-clip Filmstrip frame extractor and the
    // compositor — first `await media.are_files_ready()`, which resolves ONLY once
    // #files_ready === true. import_file() sets that flag inside its <input> flow;
    // a raw media.set() does NOT, so without this the filmstrip's get_file() polls
    // forever and every clip renders as an empty block (the thumbnail still works
    // because create_videos_from_video_files takes the File directly). #files_ready
    // is truly private, so the only public lever that sets it is get_imported_files(),
    // which reloads the "files" store (now containing our record) into the Map and
    // flips the flag. Idempotent + cheap (one IndexedDB getAll); no event await.
    await media.get_imported_files()

    // Notify omniclip's own listeners so the clip composes on the timeline.
    media.on_media_change.publish({ files: [record], action: 'added' })

    // Build a thumbnail + read duration ourselves (don't await the event).
    const [video] = await media.create_videos_from_video_files([{ file, hash, frames }])
    const rawDurationSeconds = await readDurationSeconds(file)

    const imported: ImportedMedia = {
      fileHash: hash,
      rawDurationSeconds,
      frames,
      thumbnail: video?.thumbnail ?? '',
      name,
    }
    return imported
  } finally {
    if (import.meta.env.DEV) console.timeEnd(timeLabel)
  }
}

function readDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video')
    el.preload = 'metadata'
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src)
      resolve(Number.isFinite(el.duration) ? el.duration : 0)
    }
    el.onerror = () => resolve(0)
    el.src = URL.createObjectURL(file)
  })
}
