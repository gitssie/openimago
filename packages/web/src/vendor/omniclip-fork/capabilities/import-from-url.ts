// importFromUrl — spike point 2 (openimago-uyd0).
//
// omniclip 1.0.7 imports media ONLY via an <input type=file> change event
// (Media.import_file(input: HTMLInputElement)), keying media by content hash in
// IndexedDB and deriving frames/duration/thumbnail with ffprobe/WebCodecs.
//
// This implements the contract's `importFromUrl` by: fetch(url) -> Blob ->
// File -> hand the File to omniclip's media controller -> wait for its
// `on_media_change("added")` event -> read back the import-derived facts.
//
// We feed the File via a SYNTHETIC <input> (DataTransfer) so we do NOT need to
// patch omniclip's controller. (A cleaner alternative — a forked
// `import_file_from_file(file)` method — is noted in patches/README; the
// synthetic-input route keeps the public API surface unforked.)
//
// BROWSER-ONLY: needs fetch + DataTransfer + IndexedDB + ffprobe-wasm.

// omnislate is exported from context/context.js, NOT the package root
// (omniclip/x/index.js only re-exports OmniContext + components). (openimago-x0p4)
import { omnislate } from 'omniclip/x/context/context.js'
import type {
  ImportFromUrl,
  ImportedMedia,
} from 'src/_spike/omniclip/fork-contract'
import {
  fileNameFromUrl,
  omniMediaKindFromType,
} from 'src/_spike/omniclip/fork-logic'

// omniclip's media-change payload (from controllers/media/controller.ts).
interface OmniMediaAdded {
  action: 'added' | 'removed' | 'placeholder'
  files: Array<{ hash: string; file: File; kind: string; frames?: number }>
}

function syntheticInput(file: File): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  return input
}

export const importFromUrl: ImportFromUrl = async (url, options) => {
  const name = fileNameFromUrl(url, options?.name)
  const res = await fetch(url, options?.signal ? { signal: options.signal } : undefined)
  if (!res.ok) {
    throw new Error(`importFromUrl: fetch failed for ${url} (HTTP ${res.status})`)
  }
  const blob = await res.blob()
  const kind = omniMediaKindFromType(res.headers.get('content-type') ?? blob.type, name)
  if (!kind) {
    throw new Error(`importFromUrl: unsupported media type for ${url}`)
  }
  // Give the File a concrete type so omniclip's `startsWith("video"|...)` branches.
  const typedBlob = blob.type ? blob : blob.slice(0, blob.size, `${kind}/*`)
  const file = new File([typedBlob], name, { type: typedBlob.type || `${kind}/*` })

  const media = omnislate.context.controllers.media

  const imported = await new Promise<ImportedMedia>((resolve, reject) => {
    const timer = setTimeout(() => {
      dispose()
      reject(new Error(`importFromUrl: timed out importing ${url}`))
    }, 60_000)

    const dispose = media.on_media_change((change: OmniMediaAdded) => {
      if (change.action !== 'added') return
      const added = change.files.find((f) => f.file.name === name)
      if (!added) return
      clearTimeout(timer)
      dispose()
      void buildImported(added).then(resolve).catch(reject)
    })

    // Kick off omniclip's normal import path with our synthetic input.
    media.import_file(syntheticInput(file))
  })

  return imported
}

/** Resolve the import-derived facts omniclip computed for the added file. */
async function buildImported(added: {
  hash: string
  file: File
  frames?: number
}): Promise<ImportedMedia> {
  const media = omnislate.context.controllers.media
  // omniclip builds a thumbnail when it materialises the video element.
  const [video] = await media.create_videos_from_video_files([
    { file: added.file, hash: added.hash, frames: added.frames ?? 0 },
  ])
  const durationSeconds = await readDurationSeconds(added.file)
  return {
    fileHash: added.hash,
    rawDurationSeconds: durationSeconds,
    frames: added.frames ?? 0,
    thumbnail: video?.thumbnail ?? '',
    name: added.file.name,
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
