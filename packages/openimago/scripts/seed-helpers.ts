/**
 * Pure, IO-free helpers for the seed script. Extracted so they can be unit
 * tested without a database or filesystem.
 */

export type JsonObject = Record<string, unknown>

/**
 * Return a shallow copy of a story JSON doc with its `projectId` set to the
 * given id (no-op shape change when the doc has no projectId field). Keeps the
 * seeded bible/series internally consistent with the seed project.
 */
export function withProjectId(doc: JsonObject, projectId: string): JsonObject {
  return { ...doc, projectId }
}

// ── Deterministic picsum image URLs ───────────────────────────────────────────

/** Stable, positive 32-bit FNV-1a hash (mirrors story-service.ts's mock seed). */
function stableHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Full-size dimensions per aspect ratio; default 16:9 (1280x720). */
const ASPECT_DIMENSIONS: Record<string, { w: number; h: number }> = {
  "16:9": { w: 1280, h: 720 },
  "3:4": { w: 600, h: 800 },
  "2:3": { w: 600, h: 900 },
}
const DEFAULT_DIMENSIONS = { w: 1280, h: 720 }
/** Thumbnail target width (px); height scales to keep the aspect ratio. */
const THUMB_WIDTH = 320

export interface PicsumUrls {
  preview: string
  thumbnail: string
}

/**
 * Deterministic, publicly-reachable picsum.photos image URLs for a seeded
 * artifact. The seed (artifactId/shotId) maps to a stable picsum seed so each
 * shot gets a distinct image that is identical across re-runs; the thumbnail
 * uses the SAME seed at ~320px so it shows the same picture, smaller.
 *
 * Mirrors the existing mock convention in story-service.ts (picsum.photos/seed
 * /<hash36>/W/H). Dimensions follow the aspect ratio (16:9 → 1280x720,
 * 3:4 → 600x800, 2:3 → 600x900; default 16:9).
 */
export function picsumUrlFor(seed: string, aspectRatio?: string): PicsumUrls {
  const dims = (aspectRatio && ASPECT_DIMENSIONS[aspectRatio]) || DEFAULT_DIMENSIONS
  const seedHash = stableHash(seed).toString(36)
  const thumbW = THUMB_WIDTH
  const thumbH = Math.max(1, Math.round((dims.h / dims.w) * thumbW))
  return {
    preview: `https://picsum.photos/seed/${seedHash}/${dims.w}/${dims.h}`,
    thumbnail: `https://picsum.photos/seed/${seedHash}/${thumbW}/${thumbH}`,
  }
}

/**
 * Rewrite every COMPLETED run's `result.access.{preview,thumbnail}` in a runs
 * doc to deterministic picsum URLs (the fixtures point at cdn.example.com, which
 * 404s → broken thumbnails). The picsum seed is the run's artifactId and the
 * dimensions follow its params.aspectRatio. Returns a NEW doc; the input is not
 * mutated. Non-completed runs and runs without a result are left untouched.
 */
export function rewriteRunImageUrls(runsDoc: JsonObject): JsonObject {
  const runs = Array.isArray(runsDoc.runs) ? runsDoc.runs : []
  const nextRuns = runs.map((run) => {
    if (typeof run !== "object" || run === null) return run
    const r = run as JsonObject
    if (String(r.status ?? "") !== "completed") return run
    const result = typeof r.result === "object" && r.result !== null ? (r.result as JsonObject) : null
    if (!result) return run
    const artifactId = String(result.artifactId ?? "")
    if (!artifactId) return run
    if (String(result.kind ?? "image") !== "image") return run

    const params = typeof r.params === "object" && r.params !== null ? (r.params as JsonObject) : {}
    const aspectRatio = typeof params.aspectRatio === "string" ? params.aspectRatio : undefined
    const urls = picsumUrlFor(artifactId, aspectRatio)
    return {
      ...r,
      result: { ...result, access: { preview: urls.preview, thumbnail: urls.thumbnail } },
    }
  })
  return { ...runsDoc, runs: nextRuns }
}

/**
 * Trim a series doc's `episodes` array to only the entries whose id is in
 * `presentEpisodeIds` (the episode files that actually exist on disk). This
 * prevents validate_story from reporting MISSING_EPISODE_FILE for planned-but-
 * absent episodes. `shotCount`/order of the kept entries are preserved.
 */
export function trimSeriesToPresent(series: JsonObject, presentEpisodeIds: string[]): JsonObject {
  const present = new Set(presentEpisodeIds)
  const episodes = Array.isArray(series.episodes) ? series.episodes : []
  const kept = episodes.filter(
    (e) => typeof e === "object" && e !== null && present.has(String((e as JsonObject).id ?? "")),
  )
  return { ...series, episodes: kept }
}

/** A real artifact a seeded run points at — must exist so validate_story's
 *  run.result.artifactId resolution passes (no DANGLING_ARTIFACT_REF). */
export interface SeedArtifact {
  artifactId: string
  kind: string
  mime: string
  filename: string
  previewHref: string
  thumbnailHref?: string
}

/**
 * Collect the result artifacts of every COMPLETED run in a runs doc. The seed
 * inserts a workspace_generated_files row for each so the run→artifact edge
 * resolves. Runs without a completed result (e.g. status "running") are skipped.
 */
export function completedRunArtifacts(runsDoc: JsonObject): SeedArtifact[] {
  const runs = Array.isArray(runsDoc.runs) ? runsDoc.runs : []
  const out: SeedArtifact[] = []
  for (const run of runs) {
    if (typeof run !== "object" || run === null) continue
    const r = run as JsonObject
    if (String(r.status ?? "") !== "completed") continue
    const result = typeof r.result === "object" && r.result !== null ? (r.result as JsonObject) : null
    if (!result) continue
    const artifactId = String(result.artifactId ?? "")
    if (!artifactId) continue
    const access = typeof result.access === "object" && result.access !== null ? (result.access as JsonObject) : {}
    const previewHref = typeof access.preview === "string" ? access.preview : `seed://${artifactId}`
    out.push({
      artifactId,
      kind: String(result.kind ?? "image"),
      mime: String(result.mime ?? "image/png"),
      filename: String(result.filename ?? `${artifactId}.png`),
      previewHref,
      ...(typeof access.thumbnail === "string" ? { thumbnailHref: access.thumbnail } : {}),
    })
  }
  return out
}
