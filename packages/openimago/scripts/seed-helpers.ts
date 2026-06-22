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
