// Server-side filmstrip sprite generation (openimago-k6bl).
//
// Produces the PRECOMPUTED filmstrip sprite the timeline reads — ONE horizontal
// strip of N=24 frames, each 28×50 (9:16 portrait, center-cover), frame 0 = the
// video's first frame. Byte-format matches packages/web/scripts/gen-filmstrips.mjs
// and the static demo sprites; the client (video-effect.patch.ts) renders it via
// CSS background-position. The contract this fills, on a video run/artifact:
//   result.access.filmstrip = <sprite url>
//   result.filmstrip        = { frameCount, frameW, frameH }
//
// Shells out to the SYSTEM `ffmpeg` binary (no WASM). If ffmpeg is absent or
// fails, generation SKIPS gracefully (warn, return null) — the caller leaves
// access.filmstrip unset and the client no-ops cleanly. Never throws into the
// generation flow.
//
// This module's PURE parts (arg builder, output path/url derivation, metadata)
// are unit-tested; the ffmpeg spawn + storage write are the only IO.

import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFile, rm } from "node:fs/promises"
import type { StorageAdapter } from "../storage/adapter"
import { localStorage } from "../storage/adapter"
import { logger } from "../server/logger"

// ── Contract constants (MUST match the client + static demo sprites) ──────────

export const FILMSTRIP_FRAME_COUNT = 24
export const FILMSTRIP_FRAME_W = 28
export const FILMSTRIP_FRAME_H = 50
/** Sprite file extension/format (png, matching the committed demo sprites). */
export const FILMSTRIP_EXT = "png"

/** The `result.filmstrip` dims object recorded alongside access.filmstrip. */
export interface FilmstripMeta {
  frameCount: number
  frameW: number
  frameH: number
}

export function filmstripMeta(): FilmstripMeta {
  return { frameCount: FILMSTRIP_FRAME_COUNT, frameW: FILMSTRIP_FRAME_W, frameH: FILMSTRIP_FRAME_H }
}

// ── Pure: output path / url derivation ────────────────────────────────────────

/**
 * Sprite filename for an artifact: `<artifactId>.filmstrip.png` (mirrors the
 * static demo `<name>.filmstrip.png`). Pure.
 */
export function filmstripFileName(artifactId: string): string {
  return `${artifactId}.filmstrip.${FILMSTRIP_EXT}`
}

/**
 * Where the sprite is written on disk, NEXT TO the artifact (same dir as the
 * persisted video). Pure string join.
 */
export function filmstripStoragePath(artifactDir: string, artifactId: string): string {
  return join(artifactDir, filmstripFileName(artifactId))
}

/**
 * Servable access.filmstrip URL, derived from the artifact's preview/thumbnail
 * URL by swapping the basename — so the sprite uses the SAME URL scheme/host as
 * access.preview/thumbnail (e.g. ".../<id>.mp4" → ".../<id>.filmstrip.png").
 * Falls back to just the sprite filename when the reference URL has no path.
 * Pure.
 */
export function filmstripUrlFrom(referenceUrl: string, artifactId: string): string {
  const name = filmstripFileName(artifactId)
  const hashIdx = referenceUrl.indexOf("#")
  const base = hashIdx >= 0 ? referenceUrl.slice(0, hashIdx) : referenceUrl
  const qIdx = base.indexOf("?")
  const path = qIdx >= 0 ? base.slice(0, qIdx) : base
  const slash = path.lastIndexOf("/")
  if (slash < 0) return name
  return `${path.slice(0, slash + 1)}${name}`
}

// ── Pure: ffmpeg argv builder ─────────────────────────────────────────────────

/**
 * Build the ffmpeg argv (exactly the command documented in
 * packages/web/scripts/gen-filmstrips.mjs): select every ⌊total/N⌋-th frame →
 * center-cover scale → crop to W×H → tile N×1 → one image. `-frames:v 1 -y`.
 * Pure: deterministic from the in/out paths + dims. The interval uses ffmpeg's
 * `select` expression with T (duration) * FR (frame rate) so it adapts per video.
 */
export function buildFilmstripFfmpegArgs(
  inputPath: string,
  outputPath: string,
  dims: FilmstripMeta = filmstripMeta(),
): string[] {
  const { frameCount: n, frameW: w, frameH: h } = dims
  const vf =
    `select='not(mod(n\\,floor(max(1\\,T*FR/${n}))))',` +
    `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h},` +
    `tile=${n}x1`
  return ["-i", inputPath, "-vf", vf, "-frames:v", "1", "-y", outputPath]
}

// ── ffmpeg availability + spawn (IO) ──────────────────────────────────────────

let ffmpegAvailable: boolean | null = null

/** Resolve once whether a system `ffmpeg` binary is runnable. Memoized. */
export async function isFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable
  ffmpegAvailable = await new Promise<boolean>((resolve) => {
    try {
      const proc = spawn("ffmpeg", ["-version"], { stdio: "ignore" })
      proc.on("error", () => resolve(false))
      proc.on("close", (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
  return ffmpegAvailable
}

/** Run ffmpeg with the given argv; resolve true on exit 0, false otherwise. */
function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("ffmpeg", args, { stdio: "ignore" })
      proc.on("error", () => resolve(false))
      proc.on("close", (code) => resolve(code === 0))
    } catch {
      resolve(false)
    }
  })
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface GenerateFilmstripInput {
  /** Artifact id — names the sprite file (`<id>.filmstrip.png`). */
  artifactId: string
  /** Local path to the source video file ffmpeg reads. */
  videoPath: string
  /** Directory to write the sprite into (next to the artifact). */
  outputDir: string
  /** A reference URL (access.preview/thumbnail) whose scheme the sprite URL mirrors. */
  referenceUrl: string
}

export interface GeneratedFilmstrip {
  /** Servable access.filmstrip URL. */
  url: string
  /** result.filmstrip dims. */
  filmstrip: FilmstripMeta
  /** On-disk path the sprite was written to. */
  storagePath: string
}

/**
 * Generate a filmstrip sprite for a VIDEO artifact and persist it via the storage
 * adapter, returning the access.filmstrip url + dims. Returns null (and warns)
 * when ffmpeg is unavailable or fails — NEVER throws, so the video-generation
 * flow always succeeds, just without a filmstrip.
 */
export class FilmstripService {
  constructor(private readonly storage: StorageAdapter = localStorage) {}

  async generate(input: GenerateFilmstripInput): Promise<GeneratedFilmstrip | null> {
    if (!(await isFfmpegAvailable())) {
      logger.warn({ artifactId: input.artifactId }, "filmstrip: ffmpeg unavailable — skipping sprite")
      return null
    }

    const storagePath = filmstripStoragePath(input.outputDir, input.artifactId)
    // ffmpeg writes to a temp file first; we then hand the bytes to the storage
    // adapter so any adapter (disk/S3) persists it the same way.
    const tmpOut = join(tmpdir(), filmstripFileName(`${input.artifactId}_${Date.now()}`))
    const args = buildFilmstripFfmpegArgs(input.videoPath, tmpOut)

    try {
      const ok = await runFfmpeg(args)
      if (!ok) {
        logger.warn({ artifactId: input.artifactId }, "filmstrip: ffmpeg failed — skipping sprite")
        return null
      }
      const bytes = await readFile(tmpOut)
      await this.storage.write(storagePath, new Uint8Array(bytes), { ensureDir: true })
      return {
        url: filmstripUrlFrom(input.referenceUrl, input.artifactId),
        filmstrip: filmstripMeta(),
        storagePath,
      }
    } catch (err) {
      logger.warn({ artifactId: input.artifactId, err }, "filmstrip: generation error — skipping sprite")
      return null
    } finally {
      await rm(tmpOut, { force: true }).catch(() => {})
    }
  }
}

/** Default singleton (disk storage adapter). */
export const filmstripService = new FilmstripService()
