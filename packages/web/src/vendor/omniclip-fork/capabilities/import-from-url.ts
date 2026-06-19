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

  // Content hash (omniclip keys media by this) + frame count for video.
  const hash: string = await quick_hash(file)
  const frames =
    kind === 'video' ? ((await ffprobe.getFrames(file, 1))?.nb_frames ?? 0) : 0

  const media = omnislate.context.controllers.media
  const record: AddedMediaRecord = { hash, file, kind, frames }

  // Persist to IndexedDB (skip if duplicate, like import_file) + register in the
  // controller's in-memory Map so get_file(hash) resolves immediately.
  const db = await openMediaDb()
  if (!(await hasFile(db, hash))) {
    await putFile(db, record)
  }
  media.set(hash, file)

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
