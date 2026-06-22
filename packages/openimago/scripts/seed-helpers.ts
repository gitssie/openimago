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

// ── Same-origin placeholder image URLs ────────────────────────────────────────
//
// External image hosts (picsum, cdn.example.com) are NOT reachable in the
// user's network (China egress times out). Use RELATIVE same-origin SVG
// placeholders committed under packages/web/public/mock/, exactly like the mock
// VIDEO does (story-service.ts MOCK_VIDEO_SAMPLE_URL = "/mock-clip.mp4"). Quasar
// serves public/<name> at /<name>, so the browser resolves these against its
// own origin — no internet required. The same SVG scales in <img> for both the
// preview and the thumbnail.

/** Aspect ratio → committed placeholder SVG under web/public/mock/. */
const PLACEHOLDER_BY_ASPECT: Record<string, string> = {
  "16:9": "/mock/placeholder-16x9.svg",
  "3:4": "/mock/placeholder-3x4.svg",
  "2:3": "/mock/placeholder-2x3.svg",
  "1:1": "/mock/placeholder-1x1.svg",
}
const DEFAULT_PLACEHOLDER = "/mock/placeholder-16x9.svg"

export interface PlaceholderUrls {
  preview: string
  thumbnail: string
}

/**
 * Deterministic same-origin placeholder image URLs for a seeded artifact,
 * chosen by aspect ratio (16:9 / 3:4 / 2:3 / 1:1; default 16:9). The SVG is a
 * labeled gradient box that renders in <img> with no network. `seed` is
 * accepted for API symmetry / future per-shot variants but does not change the
 * URL — the placeholder is shared per aspect ratio, which is enough to make the
 * storyboard look populated without external assets. preview and thumbnail are
 * the same scalable SVG.
 */
export function sameOriginPlaceholderFor(aspectRatio?: string, _seed?: string): PlaceholderUrls {
  const url = (aspectRatio && PLACEHOLDER_BY_ASPECT[aspectRatio]) || DEFAULT_PLACEHOLDER
  return { preview: url, thumbnail: url }
}

/**
 * Rewrite every COMPLETED image run's `result.access.{preview,thumbnail}` in a
 * runs doc to same-origin placeholder URLs (the fixtures point at
 * cdn.example.com, which 404s → broken thumbnails). The placeholder is chosen by
 * the run's params.aspectRatio. Returns a NEW doc; the input is not mutated.
 * Non-completed runs and non-image runs are left untouched.
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
    const urls = sameOriginPlaceholderFor(aspectRatio, artifactId)
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
