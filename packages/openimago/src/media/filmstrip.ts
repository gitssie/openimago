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
// Shells out to the SYSTEM `ffmpeg` (+ `ffprobe`) binaries (no WASM). Pipeline
// (Recipe B, verified against real ffmpeg 8.x):
//   1. ffprobe the duration (seconds),
//   2. fps = N / duration,
//   3. ffmpeg -vf "fps=${fps},scale=W:H:force_original_aspect_ratio=increase,
//      crop=W:H,tile=Nx1" -frames:v 1 -y <out>.png
// NB: ffmpeg's filtergraph has NO duration/framerate variables — sampling MUST
// use a precomputed numeric fps (an earlier `select='...T*FR/N...'` form embedded
// placeholder vars literally and ffmpeg failed to init the filters). If ffprobe
// or ffmpeg is absent/fails, generation SKIPS gracefully (warn, return null) —
// the caller leaves access.filmstrip unset and the client no-ops cleanly. Never
// throws into the generation flow.
//
// This module's PURE parts (fps calc, arg builder, duration parse, path/url
// derivation, metadata) are unit-tested; the ffmpeg/ffprobe spawn + storage
// write are the only IO.

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
 * packages/web/scripts/gen-filmstrips.mjs, real-ffmpeg-verified — Recipe B):
 * sample at a fixed `fps` so exactly N frames span the clip → center-cover scale
 * → crop to W×H → tile N×1 → one image. `-frames:v 1 -y`.
 *
 * IMPORTANT (openimago-k6bl): the `fps` MUST be precomputed = N / durationSeconds
 * (from a prior ffprobe call). ffmpeg's filtergraph has NO `T`/`FR` variables —
 * an earlier version embedded `T*FR/N` literally and ffmpeg failed to init the
 * filters. Keep the value-derivation outside this pure builder.
 *
 * Pure: deterministic from in/out paths + fps + dims.
 */
export function buildFilmstripFfmpegArgs(
  inputPath: string,
  outputPath: string,
  fps: number,
  dims: FilmstripMeta = filmstripMeta(),
): string[] {
  const { frameCount: n, frameW: w, frameH: h } = dims
  const vf =
    `fps=${fps},` +
    `scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h},` +
    `tile=${n}x1`
  return ["-i", inputPath, "-vf", vf, "-frames:v", "1", "-y", outputPath]
}

/**
 * Sampling fps so exactly `frameCount` frames span a clip of `durationSeconds`:
 * fps = frameCount / duration. Guarded: a non-finite/≤0 duration falls back to a
 * 1 fps default (so a tile still renders). Pure.
 */
export function filmstripFps(durationSeconds: number, frameCount = FILMSTRIP_FRAME_COUNT): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 1
  return frameCount / durationSeconds
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

/** Parse a duration (seconds) from ffprobe's csv stdout. Pure. */
export function parseProbedDuration(stdout: string): number | null {
  const v = Number.parseFloat(stdout.trim())
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * ffprobe the video's duration in seconds (Recipe B step 1). Returns null on any
 * failure / missing ffprobe — the caller then skips filmstrip generation.
 */
function probeDurationSeconds(inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath],
        { stdio: ["ignore", "pipe", "ignore"] },
      )
      let out = ""
      proc.stdout.on("data", (chunk) => {
        out += String(chunk)
      })
      proc.on("error", () => resolve(null))
      proc.on("close", (code) => resolve(code === 0 ? parseProbedDuration(out) : null))
    } catch {
      resolve(null)
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
  /** The video's REAL duration in seconds (from the ffprobe pass). The caller
   *  records this on the artifact (metadata.duration) so the timeline ruler /
   *  clip widths use the true length, not an estimate (openimago-9uwt). */
  durationSeconds: number
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

    // Recipe B step 1: ffprobe the duration so we can sample exactly N frames
    // across the clip (fps = N / duration). ffmpeg has no T/FR filtergraph vars,
    // so the value MUST be precomputed here. Missing/failed ffprobe → skip.
    const duration = await probeDurationSeconds(input.videoPath)
    if (duration === null) {
      logger.warn({ artifactId: input.artifactId }, "filmstrip: ffprobe duration failed — skipping sprite")
      return null
    }
    const fps = filmstripFps(duration)

    const storagePath = filmstripStoragePath(input.outputDir, input.artifactId)
    // ffmpeg writes to a temp file first; we then hand the bytes to the storage
    // adapter so any adapter (disk/S3) persists it the same way.
    const tmpOut = join(tmpdir(), filmstripFileName(`${input.artifactId}_${Date.now()}`))
    const args = buildFilmstripFfmpegArgs(input.videoPath, tmpOut, fps)

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
        durationSeconds: duration,
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
