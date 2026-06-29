// importFromUrl — programmatic media import (openimago-uyd0 → fixed 1mcb).
//
// omniclip 1.0.7's Media.import_file(input) only works from a real <input>
// change and emits on_media_change("added") only for non-duplicates — so a
// synthetic-input import never reliably resolves (the prior approach awaited an
// event that doesn't fire for programmatic adds → 60s timeout). (openimago-1mcb)
//
// This drives the import DETERMINISTICALLY, replicating import_file's effect
// without depending on its event: fetch → Blob → File → quick_hash → ffprobe
// frames → write the AnyMedia record to omniclip's "database" IndexedDB store
// (same shape import_file writes) → media.set(hash, record) (the controller is a
// Map<hash, AnyMedia>) → publish on_media_change("added") so omniclip's OWN
// listeners (omni-media panel, compositor) pick up the clip → resolve with the
// facts we computed. We never await on_media_change ourselves.
//
// 1.1.3 PORT (openimago-lpjd): Media stores AnyMedia records (not raw Files) and
// renamed create_videos_from_video_files → create_video_elements; see inline notes.
//
// BROWSER-ONLY: needs fetch + IndexedDB + ffprobe-wasm + WebCodecs.

import { omnislate } from '../upstream/context/context'
import { quick_hash } from '@benev/construct'
import { FFprobeWorker } from 'ffprobe-wasm/browser.mjs'
import type { AnyMedia, VideoFile } from '../upstream/components/omni-media/types'
import type { ImportFromUrl, ImportedMedia } from 'src/utils/cut/fork-contract'
import { fileNameFromUrl, omniMediaKindFromType } from 'src/utils/cut/fork-logic'

const ffprobe = new FFprobeWorker()

// Serialize access to the SINGLE shared FFprobeWorker (openimago-ah1j). When
// hydrate imports N clips concurrently, parallel getFrames() calls on one worker
// interleave their postMessage/onmessage round-trips and can return the wrong
// clip's frame count (or hang). fetch/blob/hash/IndexedDB stay parallel — only
// this one shared-worker call funnels through a promise-chain mutex. media.set /
// on_media_change are synchronous and are_files_ready() is idempotent, so none of
// them needs a lock.
let ffprobeChain: Promise<unknown> = Promise.resolve()
function probeFramesSerialized(file: File): Promise<number> {
  const run = ffprobeChain.then(async () => (await ffprobe.getFrames(file, 1))?.nb_frames ?? 0)
  // Keep the chain alive even if one probe rejects, so a single failure doesn't
  // wedge every later import behind a rejected promise.
  ffprobeChain = run.catch(() => undefined)
  return run
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

/** Persist the media record into the "files" store (same AnyMedia shape import_file
 *  writes — keyPath "hash"). */
function putFile(db: IDBDatabase, record: AnyMedia): Promise<void> {
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
    // Forward optional auth headers (openimago-tc8t). Clip /mock files pass none;
    // the BGM authed /api/.../download gets `Authorization: Bearer <token>` from
    // the host. Only build a RequestInit when we actually have signal or headers.
    const init: RequestInit = {}
    if (options?.signal) init.signal = options.signal
    if (options?.headers && Object.keys(options.headers).length > 0) {
      init.headers = options.headers
    }
    const res = await fetch(url, Object.keys(init).length > 0 ? init : undefined)
    if (!res.ok) {
      throw new Error(`importFromUrl: fetch failed for ${url} (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const kind = omniMediaKindFromType(res.headers.get('content-type') ?? blob.type, name)
    if (!kind) throw new Error(`importFromUrl: unsupported media type for ${url}`)

    // Ensure the File carries a concrete type so downstream `startsWith` branches.
    const typedBlob = blob.type ? blob : blob.slice(0, blob.size, `${kind}/*`)
    const file = new File([typedBlob], name, { type: typedBlob.type || `${kind}/*` })

    // Content hash (omniclip keys media by this) + frame count for video + duration
    // (video & audio). ffprobe runs through a mutex (single shared worker) so
    // concurrent hydrate imports don't corrupt each other's frame count
    // (openimago-ah1j).
    const hash: string = await quick_hash(file)
    const frames = kind === 'video' ? await probeFramesSerialized(file) : 0
    const rawDurationSeconds =
      kind === 'video' || kind === 'audio' ? await readDurationSeconds(file) : 0

    const media = omnislate.context.controllers.media

    // 1.1.3's Media (controllers/media/controller.ts) is a `Map<hash, AnyMedia>` and
    // `get_file(hash)` returns `this.get(hash)?.file` — so the stored value MUST be
    // the full AnyMedia record ({file, hash, kind, ...}), NOT a raw File (the 1.0.7
    // shape). The compositor's VideoManager also reads frames/fps/duration off it
    // (openimago-lpjd). fps is derived (frames/seconds) since ffprobe gives frames.
    const record: AnyMedia =
      kind === 'video'
        ? {
            file,
            hash,
            kind: 'video',
            frames,
            duration: rawDurationSeconds * 1000,
            fps: rawDurationSeconds > 0 ? frames / rawDurationSeconds : 0,
            proxy: false,
          }
        : kind === 'audio'
          ? { file, hash, kind: 'audio' }
          : { file, hash, kind: 'image' }

    // Persist to IndexedDB (skip if duplicate, like import_file) + register in the
    // controller's in-memory Map so get_file(hash) resolves immediately.
    const db = await openMediaDb()
    if (!(await hasFile(db, hash))) {
      await putFile(db, record)
    }
    media.set(hash, record)

    // Ensure the controller's #files_ready gate is open before downstream get_file()
    // calls (filmstrip extractor + compositor) — they `await media.are_files_ready()`
    // and would poll forever if it never resolves. In 1.1.3 #files_ready flips true
    // once in the Media constructor's store load (#get_imported_files); a raw
    // media.set() does not touch it, so by the time a user import runs the gate is
    // already open — we just await it to be safe (no event await; idempotent).
    await media.are_files_ready()

    // Notify omniclip's own listeners (omni-media panel, etc.) so the asset appears.
    media.on_media_change.publish({ files: [record], action: 'added' })

    // Build a thumbnail (video only) via 1.1.3's create_video_elements (renamed from
    // 1.0.7's create_videos_from_video_files); it builds a <video>, captures one
    // frame, and returns a Video with `.thumbnail`.
    const thumbnail =
      kind === 'video'
        ? ((await media.create_video_elements([record as VideoFile]))[0]?.thumbnail ?? '')
        : ''

    const imported: ImportedMedia = {
      fileHash: hash,
      rawDurationSeconds,
      frames,
      thumbnail,
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
