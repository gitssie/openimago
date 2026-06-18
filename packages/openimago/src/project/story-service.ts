import { eq } from "drizzle-orm"
import { readFile, access, writeFile, rename, mkdir } from "fs/promises"
import path from "path"
import { db } from "../db/client"
import { projects } from "../db/schema"
import { logger } from "../server/logger"

// ── Canonical story file names relative to project directory ──────────────────

const CANONICAL_MANIFEST = "openimago.json"
const CANONICAL_AGENTS = "AGENTS.md"
const CANONICAL_BIBLE = "story/bible.json"
const CANONICAL_SERIES = "story/series.json"

const STORY_EPISODES_DIR = "story/episodes"
const STORY_WORKFLOW_DIR = "story/workflow"
const STORY_RUNS_DIR = "story/runs"
const STORY_CUTS_DIR = "story/cuts"

// ── Safe file name patterns for episodes ──────────────────────────────────────

const SAFE_EPISODE_PATTERN = /^ep_[a-z0-9_]+\.json$/
const SAFE_EP_RELATED_PATTERN = /^ep_[a-z0-9_]+\.(workflow|runs|cut)\.json$/

// ── Cut transition kinds (ADR 0006 edit layer) ────────────────────────────────

const CUT_TRANSITION_KINDS = ["cut", "dissolve", "fade"] as const

// ── Mock generation helpers (ADR 0005 mock command) ───────────────────────────

/** Stable, positive 32-bit FNV-1a hash (mirrors opencode mockImageProvider). */
function stableHash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Browser-loadable picsum.photos URL seeded from a stable hash of `seed`. */
function mockImageUrl(seed: string): string {
  return `https://picsum.photos/seed/${stableHash(seed).toString(36)}/1024/1024`
}

/** Short random slug for run / artifact ids. */
function randomSlug(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoryManifest {
  schemaVersion: number
  projectId: string
  createdAt: string
  storyPath: string
  outputsPath: string
}

export interface StoryBible {
  schemaVersion: number
  projectId: string
  world: {
    name: string
    description: string
    era: string
    moodKeywords: string[]
    visualStyleNotes: string
  }
  characters: Record<string, unknown>[]
  scenes: Record<string, unknown>[]
  styleSeeds: Record<string, unknown>[]
  updatedAt: string
}

export interface StorySeries {
  schemaVersion: number
  projectId: string
  title: string
  description: string
  status: string
  episodes: Record<string, unknown>[]
  updatedAt: string
}

export interface StoryEpisode {
  schemaVersion: number
  id: string
  episodeNumber: number
  title: string
  logline: string
  synopsis: string
  status: string
  shots: Record<string, unknown>[]
  updatedAt: string
}

/** A single shot appended by the UI (ADR 0004 EpisodeShot, ADR 0005 write). */
export interface EpisodeShot {
  id: string
  shotNumber: number
  sceneId: string
  description: string
  cameraNotes: string
  lightingNotes: string
  dialog: Record<string, unknown>[]
  characterIds: string[]
  referenceArtifactIds: string[]
  status: string
}

/** A generation run appended to runs.json (ADR 0004 GenerationRun). */
export interface GenerationRun {
  id: string
  nodeId: string
  shotId: string
  status: string
  params: { prompt: string; model: string }
  result: {
    artifactId: string
    kind: string
    mime: string
    filename: string
    access: { preview: string; thumbnail: string }
  }
  startedAt: string
  completedAt: string
}

export interface StoryWorkflow {
  schemaVersion: number
  episodeId: string
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
}

export interface StoryRuns {
  schemaVersion: number
  episodeId: string
  runs: Record<string, unknown>[]
}

// ── Episode Cut (ADR 0006 — edit layer, separate cut.json file) ───────────────

/** A trimmed slice of a source Shot's media on the video track. */
export interface CutClip {
  id: string
  sourceShotId: string
  inPoint: number
  outPoint: number
  order: number
}

/** A transition that plays after a given clip. */
export interface CutTransition {
  afterClipId: string
  kind: (typeof CUT_TRANSITION_KINDS)[number]
  durationSeconds: number
}

/** A single BGM audio bed reference for the Cut. */
export interface CutAudioRef {
  artifactId: string
  gainDb?: number
  inPoint?: number
  outPoint?: number
}

/** Edit-layer state for an episode — its own optimistic-concurrency clock. */
export interface EpisodeCut {
  schemaVersion: 1
  episodeId: string
  clips: CutClip[]
  transitions: CutTransition[]
  bgm?: CutAudioRef
  updatedAt: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class StoryService {
  /**
   * Validate project ownership and return the project directory.
   */
  private async resolveProjectDir(
    projectId: string,
    userId: string,
  ): Promise<string | { error: { code: string; message: string }; status: number }> {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }

    const project = rows[0]!

    if (project.userId !== userId) {
      logger.warn({ userId, projectId }, "story: forbidden — not project owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }

    return project.directory
  }

  /**
   * Read and parse a JSON file from the project directory.
   * Guard: only allows canonical file names / known scaffold paths.
   */
  private async readJsonFile<T>(
    projectDir: string,
    relativePath: string,
    projectId: string,
  ): Promise<{ data: T; status: 200 } | { error: { code: string; message: string }; status: number }> {
    const fullPath = path.join(projectDir, relativePath)

    // Path traversal guard: resolved path must stay inside project directory
    const resolved = path.resolve(fullPath)
    const resolvedDir = path.resolve(projectDir)
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      logger.warn({ projectId, relativePath }, "story: path traversal blocked")
      return { error: { code: "FORBIDDEN", message: "Invalid story path" }, status: 403 }
    }

    try {
      await access(resolved)
    } catch {
      return { error: { code: "NOT_FOUND", message: `Story file not found: ${relativePath}` }, status: 404 }
    }

    try {
      const raw = await readFile(resolved, "utf-8")
      const data = JSON.parse(raw) as T
      return { data, status: 200 }
    } catch (err) {
      logger.warn({ projectId, relativePath, err }, "story: failed to read/parse story file")
      return { error: { code: "INTERNAL_ERROR", message: "Failed to read story file" }, status: 500 }
    }
  }

  /**
   * Atomically write JSON to a path inside the project directory: write a
   * temp file then rename over the target, so a crash never leaves a
   * half-written story file. Re-applies the path-traversal guard.
   */
  private async writeJsonFileAtomic(
    projectDir: string,
    relativePath: string,
    data: unknown,
    projectId: string,
  ): Promise<{ status: 200 } | { error: { code: string; message: string }; status: number }> {
    const resolved = path.resolve(path.join(projectDir, relativePath))
    const resolvedDir = path.resolve(projectDir)
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      logger.warn({ projectId, relativePath }, "story: path traversal blocked (write)")
      return { error: { code: "FORBIDDEN", message: "Invalid story path" }, status: 403 }
    }

    const tmpPath = `${resolved}.tmp-${process.pid}-${Date.now()}`
    try {
      await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8")
      await rename(tmpPath, resolved)
      return { status: 200 }
    } catch (err) {
      logger.error({ projectId, relativePath, err }, "story: failed to write story file")
      return { error: { code: "INTERNAL_ERROR", message: "Failed to write story file" }, status: 500 }
    }
  }

  /**
   * Read a text file (like AGENTS.md) from the project directory.
   */
  private async readTextFile(
    projectDir: string,
    relativePath: string,
    projectId: string,
  ): Promise<{ data: string; status: 200 } | { error: { code: string; message: string }; status: number }> {
    const fullPath = path.join(projectDir, relativePath)

    const resolved = path.resolve(fullPath)
    const resolvedDir = path.resolve(projectDir)
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      logger.warn({ projectId, relativePath }, "story: path traversal blocked (text)")
      return { error: { code: "FORBIDDEN", message: "Invalid story path" }, status: 403 }
    }

    try {
      await access(resolved)
    } catch {
      return { error: { code: "NOT_FOUND", message: `Story file not found: ${relativePath}` }, status: 404 }
    }

    try {
      const raw = await readFile(resolved, "utf-8")
      return { data: raw, status: 200 }
    } catch (err) {
      logger.warn({ projectId, relativePath, err }, "story: failed to read story text file")
      return { error: { code: "INTERNAL_ERROR", message: "Failed to read story file" }, status: 500 }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async getManifest(projectId: string, userId: string) {
    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StoryManifest>(dir, CANONICAL_MANIFEST, projectId)
  }

  async getAgents(projectId: string, userId: string) {
    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    const result = await this.readTextFile(dir, CANONICAL_AGENTS, projectId)
    if ("error" in result) return result
    return { text: result.data, status: 200 } as const
  }

  async getBible(projectId: string, userId: string) {
    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StoryBible>(dir, CANONICAL_BIBLE, projectId)
  }

  async getSeries(projectId: string, userId: string) {
    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StorySeries>(dir, CANONICAL_SERIES, projectId)
  }

  async getEpisode(projectId: string, userId: string, episodeId: string) {
    // Validate episode ID is a safe slug
    const safeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 } as const
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StoryEpisode>(dir, `${STORY_EPISODES_DIR}/${safeFile}`, projectId)
  }

  /**
   * Append a new (empty, pending) shot to an episode (ADR 0005).
   *
   * Optimistic concurrency: when `expectedUpdatedAt` is provided and differs
   * from the file's current `updatedAt`, returns 409 without writing. On
   * success the shot is appended (shotNumber = max + 1, unique slug id),
   * `updatedAt` is bumped, and the file is written atomically.
   */
  async addShot(
    projectId: string,
    userId: string,
    episodeId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { shot: EpisodeShot; updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const safeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (addShot)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const relativePath = `${STORY_EPISODES_DIR}/${safeFile}`
    const read = await this.readJsonFile<StoryEpisode>(dir, relativePath, projectId)
    if ("error" in read) return read

    const episode = read.data

    // Optimistic concurrency guard (ADR 0005): refuse stale writes.
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== episode.updatedAt) {
      logger.info(
        { projectId, episodeId, expectedUpdatedAt, actual: episode.updatedAt },
        "story: addShot conflict — stale updatedAt",
      )
      return {
        error: { code: "CONFLICT", message: "Episode was modified since last read" },
        status: 409,
      }
    }

    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const maxShotNumber = shots.reduce((max, s) => {
      const n = typeof s["shotNumber"] === "number" ? s["shotNumber"] : 0
      return n > max ? n : max
    }, 0)
    const nextNumber = maxShotNumber + 1

    // Stable, unique slug. Suffix on the rare id collision.
    const existingIds = new Set(shots.map((s) => String(s["id"] ?? "")))
    const baseId = `s${String(nextNumber).padStart(2, "0")}-new`
    let shotId = baseId
    let suffix = 2
    while (existingIds.has(shotId)) {
      shotId = `${baseId}-${suffix}`
      suffix += 1
    }

    const newShot: EpisodeShot = {
      id: shotId,
      shotNumber: nextNumber,
      sceneId: "",
      description: "",
      cameraNotes: "",
      lightingNotes: "",
      dialog: [],
      characterIds: [],
      referenceArtifactIds: [],
      status: "pending",
    }

    const now = new Date().toISOString()
    const updatedEpisode: StoryEpisode = {
      ...episode,
      shots: [...shots, newShot as unknown as Record<string, unknown>],
      updatedAt: now,
    }

    const write = await this.writeJsonFileAtomic(dir, relativePath, updatedEpisode, projectId)
    if ("error" in write) return write

    return { data: { shot: newShot, updatedAt: now }, status: 200 }
  }

  /**
   * Shared prelude for episode write ops (ADR 0005): validate the episode id,
   * resolve+authorize the project dir, read the episode, and apply the
   * optimistic-concurrency guard. Returns the loaded episode + write path, or
   * an error envelope to forward verbatim.
   */
  private async loadEpisodeForWrite(
    projectId: string,
    userId: string,
    episodeId: string,
    expectedUpdatedAt: string | undefined,
    op: string,
  ): Promise<
    | { dir: string; relativePath: string; episode: StoryEpisode }
    | { error: { code: string; message: string }; status: number }
  > {
    const safeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeFile)) {
      logger.warn({ projectId, episodeId, op }, "story: invalid episode ID")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const relativePath = `${STORY_EPISODES_DIR}/${safeFile}`
    const read = await this.readJsonFile<StoryEpisode>(dir, relativePath, projectId)
    if ("error" in read) return read

    const episode = read.data
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== episode.updatedAt) {
      logger.info(
        { projectId, episodeId, op, expectedUpdatedAt, actual: episode.updatedAt },
        "story: write conflict — stale updatedAt",
      )
      return { error: { code: "CONFLICT", message: "Episode was modified since last read" }, status: 409 }
    }

    return { dir, relativePath, episode }
  }

  /**
   * Delete a shot from an episode (ADR 0005). Remaining shots are renumbered
   * 1..N. Optimistic concurrency + atomic write + bumped updatedAt.
   */
  async deleteShot(
    projectId: string,
    userId: string,
    episodeId: string,
    shotId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadEpisodeForWrite(projectId, userId, episodeId, expectedUpdatedAt, "deleteShot")
    if ("error" in loaded) return loaded
    const { dir, relativePath, episode } = loaded

    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const idx = shots.findIndex((s) => String(s["id"] ?? "") === shotId)
    if (idx < 0) {
      return { error: { code: "NOT_FOUND", message: `Shot not found: ${shotId}` }, status: 404 }
    }

    const remaining = shots.filter((_, i) => i !== idx)
    const renumbered = remaining.map((s, i) => ({ ...s, shotNumber: i + 1 }))

    const now = new Date().toISOString()
    const updatedEpisode: StoryEpisode = { ...episode, shots: renumbered, updatedAt: now }
    const write = await this.writeJsonFileAtomic(dir, relativePath, updatedEpisode, projectId)
    if ("error" in write) return write

    return { data: { updatedAt: now }, status: 200 }
  }

  /**
   * Update whitelisted fields of a shot (ADR 0005). Only
   * description / sceneId / cameraNotes / lightingNotes are applied; other keys
   * are ignored. Optimistic concurrency + atomic write + bumped updatedAt.
   */
  async updateShot(
    projectId: string,
    userId: string,
    episodeId: string,
    shotId: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { shot: Record<string, unknown>; updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadEpisodeForWrite(projectId, userId, episodeId, expectedUpdatedAt, "updateShot")
    if ("error" in loaded) return loaded
    const { dir, relativePath, episode } = loaded

    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const idx = shots.findIndex((s) => String(s["id"] ?? "") === shotId)
    if (idx < 0) {
      return { error: { code: "NOT_FOUND", message: `Shot not found: ${shotId}` }, status: 404 }
    }

    const ALLOWED = ["description", "sceneId", "cameraNotes", "lightingNotes"] as const
    const applied: Record<string, string> = {}
    for (const key of ALLOWED) {
      const value = patch[key]
      if (typeof value === "string") applied[key] = value
    }

    const updatedShot = { ...shots[idx]!, ...applied }
    const updatedShots = shots.map((s, i) => (i === idx ? updatedShot : s))

    const now = new Date().toISOString()
    const updatedEpisode: StoryEpisode = { ...episode, shots: updatedShots, updatedAt: now }
    const write = await this.writeJsonFileAtomic(dir, relativePath, updatedEpisode, projectId)
    if ("error" in write) return write

    return { data: { shot: updatedShot, updatedAt: now }, status: 200 }
  }

  /**
   * Reorder an episode's shots to match `orderedShotIds` and rewrite
   * shotNumber = 1..N (ADR 0005). The id set must exactly match the existing
   * shots (same count, same members) or 400 is returned. Optimistic
   * concurrency + atomic write + bumped updatedAt.
   */
  async reorderShots(
    projectId: string,
    userId: string,
    episodeId: string,
    orderedShotIds: string[],
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadEpisodeForWrite(projectId, userId, episodeId, expectedUpdatedAt, "reorderShots")
    if ("error" in loaded) return loaded
    const { dir, relativePath, episode } = loaded

    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const currentIds = shots.map((s) => String(s["id"] ?? ""))

    // The provided order must be a permutation of the existing ids: same length,
    // no dupes, same membership.
    const orderedSet = new Set(orderedShotIds)
    const currentSet = new Set(currentIds)
    const sameSet =
      orderedShotIds.length === currentIds.length &&
      orderedSet.size === orderedShotIds.length &&
      orderedShotIds.every((id) => currentSet.has(id))
    if (!sameSet) {
      return {
        error: { code: "VALIDATION_ERROR", message: "orderedShotIds must match the current shot set" },
        status: 400,
      }
    }

    const byId = new Map(shots.map((s) => [String(s["id"] ?? ""), s]))
    const reordered = orderedShotIds.map((id, i) => ({ ...byId.get(id)!, shotNumber: i + 1 }))

    const now = new Date().toISOString()
    const updatedEpisode: StoryEpisode = { ...episode, shots: reordered, updatedAt: now }
    const write = await this.writeJsonFileAtomic(dir, relativePath, updatedEpisode, projectId)
    if ("error" in write) return write

    return { data: { updatedAt: now }, status: 200 }
  }

  /**
   * Generate a keyframe for a shot (ADR 0005 — "generation = backend command").
   *
   * THIS IS A MOCK COMMAND: it does not call opencode/agent or a real provider.
   * It synchronously appends a `completed` GenerationRun to runs.json with a
   * picsum.photos result (model = "mock-image-model", artifactId = mock_*) and
   * flips the shot's status to "generated". A real provider is a follow-up.
   *
   * runs.json is append-only (no updatedAt, no 409). The episode write reuses
   * the optimistic episode write path (atomic + bumped updatedAt).
   */
  async generateShot(
    projectId: string,
    userId: string,
    episodeId: string,
    shotId: string,
  ): Promise<
    | { data: { run: GenerationRun }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const safeEpisodeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeEpisodeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (generateShot)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const episodePath = `${STORY_EPISODES_DIR}/${safeEpisodeFile}`
    const epRead = await this.readJsonFile<StoryEpisode>(dir, episodePath, projectId)
    if ("error" in epRead) return epRead
    const episode = epRead.data

    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const shotIdx = shots.findIndex((s) => String(s["id"] ?? "") === shotId)
    if (shotIdx < 0) {
      return { error: { code: "NOT_FOUND", message: `Shot not found: ${shotId}` }, status: 404 }
    }
    const shot = shots[shotIdx]!

    const description = typeof shot["description"] === "string" ? shot["description"] : ""
    const shotNumber = typeof shot["shotNumber"] === "number" ? shot["shotNumber"] : shotIdx + 1
    const prompt = description.trim() || `shot ${shotNumber}`

    // ── Mock provider result (picsum, hash-seeded like opencode mockImage) ──
    const imageUrl = mockImageUrl(`${shotId}${prompt}`)
    const now = new Date().toISOString()
    const run: GenerationRun = {
      id: `run_${randomSlug()}`,
      nodeId: "",
      shotId,
      status: "completed",
      params: { prompt, model: "mock-image-model" },
      result: {
        artifactId: `mock_${randomSlug()}`,
        kind: "image",
        mime: "image/png",
        filename: `${shotId}.png`,
        access: { preview: imageUrl, thumbnail: imageUrl },
      },
      startedAt: now,
      completedAt: now,
    }

    // ── Append to runs.json (append-only; initialize when missing) ──
    const runsFile = `${episodeId}.runs.json`
    if (!SAFE_EP_RELATED_PATTERN.test(runsFile)) {
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }
    const runsPath = `${STORY_RUNS_DIR}/${runsFile}`
    const runsRead = await this.readJsonFile<StoryRuns>(dir, runsPath, projectId)
    const runsDoc: StoryRuns =
      "error" in runsRead
        ? { schemaVersion: 1, episodeId, runs: [] }
        : runsRead.data
    const existingRuns = Array.isArray(runsDoc.runs) ? runsDoc.runs : []
    const updatedRuns: StoryRuns = {
      ...runsDoc,
      schemaVersion: runsDoc.schemaVersion ?? 1,
      episodeId: runsDoc.episodeId ?? episodeId,
      runs: [...existingRuns, run as unknown as Record<string, unknown>],
    }
    const runsWrite = await this.writeJsonFileAtomic(dir, runsPath, updatedRuns, projectId)
    if ("error" in runsWrite) return runsWrite

    // ── Flip shot status → generated (atomic episode write + bump updatedAt) ──
    const updatedShots = shots.map((s, i) =>
      i === shotIdx ? { ...s, status: "generated" } : s,
    )
    const updatedEpisode: StoryEpisode = {
      ...episode,
      shots: updatedShots,
      updatedAt: now,
    }
    const epWrite = await this.writeJsonFileAtomic(dir, episodePath, updatedEpisode, projectId)
    if ("error" in epWrite) return epWrite

    return { data: { run }, status: 200 }
  }

  async getEpisodeWorkflow(projectId: string, userId: string, episodeId: string) {
    const safeFile = `${episodeId}.workflow.json`
    if (!SAFE_EP_RELATED_PATTERN.test(safeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID for workflow")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 } as const
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StoryWorkflow>(dir, `${STORY_WORKFLOW_DIR}/${safeFile}`, projectId)
  }

  async getEpisodeRuns(projectId: string, userId: string, episodeId: string) {
    const safeFile = `${episodeId}.runs.json`
    if (!SAFE_EP_RELATED_PATTERN.test(safeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID for runs")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 } as const
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir
    return this.readJsonFile<StoryRuns>(dir, `${STORY_RUNS_DIR}/${safeFile}`, projectId)
  }

  // ── Episode Cut (ADR 0006) ──────────────────────────────────────────────────

  /** Validate the episode id and return the cut file's relative path. */
  private cutRelativePath(episodeId: string): string | null {
    const safeFile = `${episodeId}.cut.json`
    if (!SAFE_EP_RELATED_PATTERN.test(safeFile)) return null
    return `${STORY_CUTS_DIR}/${safeFile}`
  }

  /** An empty Cut, returned lazily when no cut file exists yet (ADR 0006). */
  private emptyCut(episodeId: string): EpisodeCut {
    return { schemaVersion: 1, episodeId, clips: [], transitions: [], updatedAt: "" }
  }

  /**
   * Read an episode's Cut (ADR 0006). When the cut file does not exist the Cut
   * is lazily synthesized as empty — never a 404 — so the timeline opens cleanly
   * for episodes that have never been cut. Orphan clips (sourceShotId no longer
   * present in the script) are returned as-is; the reader never drops them.
   */
  async getEpisodeCut(
    projectId: string,
    userId: string,
    episodeId: string,
  ): Promise<
    | { data: EpisodeCut; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const relativePath = this.cutRelativePath(episodeId)
    if (relativePath === null) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID for cut")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const read = await this.readJsonFile<EpisodeCut>(dir, relativePath, projectId)
    if ("error" in read) {
      // Missing file → lazily empty Cut. Any other error is forwarded.
      if (read.status === 404) return { data: this.emptyCut(episodeId), status: 200 }
      return read
    }
    return { data: read.data, status: 200 }
  }

  /**
   * Shared prelude for Cut write ops (ADR 0006, mirrors loadEpisodeForWrite).
   * Validates the episode id, resolves+authorizes the project dir, reads the
   * cut (synthesizing an empty one when absent), and applies the
   * optimistic-concurrency guard against the cut's own updatedAt.
   */
  private async loadCutForWrite(
    projectId: string,
    userId: string,
    episodeId: string,
    expectedUpdatedAt: string | undefined,
    op: string,
  ): Promise<
    | { dir: string; relativePath: string; cut: EpisodeCut }
    | { error: { code: string; message: string }; status: number }
  > {
    const relativePath = this.cutRelativePath(episodeId)
    if (relativePath === null) {
      logger.warn({ projectId, episodeId, op }, "story: invalid episode ID for cut write")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const read = await this.readJsonFile<EpisodeCut>(dir, relativePath, projectId)
    let cut: EpisodeCut
    if ("error" in read) {
      if (read.status !== 404) return read
      cut = this.emptyCut(episodeId)
    } else {
      cut = read.data
    }

    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== cut.updatedAt) {
      logger.info(
        { projectId, episodeId, op, expectedUpdatedAt, actual: cut.updatedAt },
        "story: cut write conflict — stale updatedAt",
      )
      return { error: { code: "CONFLICT", message: "Cut was modified since last read" }, status: 409 }
    }

    return { dir, relativePath, cut }
  }

  /**
   * Persist an updated Cut: lazily create story/cuts/, bump updatedAt, and write
   * atomically. Returns the new updatedAt or an error envelope.
   */
  private async writeCut(
    dir: string,
    relativePath: string,
    cut: Omit<EpisodeCut, "updatedAt">,
    projectId: string,
  ): Promise<{ updatedAt: string } | { error: { code: string; message: string }; status: number }> {
    try {
      await mkdir(path.join(dir, STORY_CUTS_DIR), { recursive: true })
    } catch (err) {
      logger.error({ projectId, err }, "story: failed to create cuts directory")
      return { error: { code: "INTERNAL_ERROR", message: "Failed to create cuts directory" }, status: 500 }
    }

    const now = new Date().toISOString()
    const doc: EpisodeCut = { ...cut, schemaVersion: 1, updatedAt: now }
    const write = await this.writeJsonFileAtomic(dir, relativePath, doc, projectId)
    if ("error" in write) return write
    return { updatedAt: now }
  }

  /**
   * Reorder the Cut's clips to match `orderedClipIds`, rewriting order = 0..N-1.
   * The id set must exactly match the current clips (same count, members).
   */
  async reorderClips(
    projectId: string,
    userId: string,
    episodeId: string,
    orderedClipIds: string[],
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "reorderClips")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const currentIds = cut.clips.map((c) => c.id)
    const orderedSet = new Set(orderedClipIds)
    const currentSet = new Set(currentIds)
    const sameSet =
      orderedClipIds.length === currentIds.length &&
      orderedSet.size === orderedClipIds.length &&
      orderedClipIds.every((id) => currentSet.has(id))
    if (!sameSet) {
      return {
        error: { code: "VALIDATION_ERROR", message: "orderedClipIds must match the current clip set" },
        status: 400,
      }
    }

    const byId = new Map(cut.clips.map((c) => [c.id, c]))
    const clips = orderedClipIds.map((id, i) => ({ ...byId.get(id)!, order: i }))

    const result = await this.writeCut(dir, relativePath, { ...cut, clips }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /**
   * Trim one clip's in/out points. Both bounds must be finite numbers with
   * inPoint < outPoint and inPoint >= 0.
   */
  async trimClip(
    projectId: string,
    userId: string,
    episodeId: string,
    clipId: string,
    inPoint: number,
    outPoint: number,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (
      !Number.isFinite(inPoint) ||
      !Number.isFinite(outPoint) ||
      inPoint < 0 ||
      inPoint >= outPoint
    ) {
      return {
        error: { code: "VALIDATION_ERROR", message: "Require finite inPoint >= 0 and inPoint < outPoint" },
        status: 400,
      }
    }

    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "trimClip")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const idx = cut.clips.findIndex((c) => c.id === clipId)
    if (idx < 0) return { error: { code: "NOT_FOUND", message: `Clip not found: ${clipId}` }, status: 404 }

    const clips = cut.clips.map((c, i) => (i === idx ? { ...c, inPoint, outPoint } : c))
    const result = await this.writeCut(dir, relativePath, { ...cut, clips }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /**
   * Split one clip at `atSeconds` (an absolute source time, inPoint < t < outPoint)
   * into two consecutive clips sharing the source. The first keeps the original
   * id and [inPoint, t); the second is a new clip with [t, outPoint). All clip
   * orders are re-indexed 0..N-1.
   */
  async splitClip(
    projectId: string,
    userId: string,
    episodeId: string,
    clipId: string,
    atSeconds: number,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string; newClipId: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "splitClip")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const idx = cut.clips.findIndex((c) => c.id === clipId)
    if (idx < 0) return { error: { code: "NOT_FOUND", message: `Clip not found: ${clipId}` }, status: 404 }

    const target = cut.clips[idx]!
    if (!Number.isFinite(atSeconds) || atSeconds <= target.inPoint || atSeconds >= target.outPoint) {
      return {
        error: { code: "VALIDATION_ERROR", message: "atSeconds must be strictly within the clip's in/out range" },
        status: 400,
      }
    }

    const existingIds = new Set(cut.clips.map((c) => c.id))
    let newId = `${target.id}-b`
    let suffix = 2
    while (existingIds.has(newId)) {
      newId = `${target.id}-b${suffix}`
      suffix += 1
    }

    const firstHalf: CutClip = { ...target, outPoint: atSeconds }
    const secondHalf: CutClip = {
      id: newId,
      sourceShotId: target.sourceShotId,
      inPoint: atSeconds,
      outPoint: target.outPoint,
      order: 0,
    }

    const spliced = [...cut.clips.slice(0, idx), firstHalf, secondHalf, ...cut.clips.slice(idx + 1)]
    const clips = spliced.map((c, i) => ({ ...c, order: i }))

    const result = await this.writeCut(dir, relativePath, { ...cut, clips }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt, newClipId: newId }, status: 200 }
  }

  /**
   * Delete a clip, re-index remaining clips 0..N-1, and drop any transition that
   * referenced the deleted clip (its trailing transition no longer applies).
   */
  async deleteClip(
    projectId: string,
    userId: string,
    episodeId: string,
    clipId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "deleteClip")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const idx = cut.clips.findIndex((c) => c.id === clipId)
    if (idx < 0) return { error: { code: "NOT_FOUND", message: `Clip not found: ${clipId}` }, status: 404 }

    const clips = cut.clips.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i }))
    const transitions = cut.transitions.filter((t) => t.afterClipId !== clipId)

    const result = await this.writeCut(dir, relativePath, { ...cut, clips, transitions }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /**
   * Set (insert or replace) the transition after `afterClipId`. The kind must be
   * one of the known CUT_TRANSITION_KINDS and afterClipId must be an existing clip.
   */
  async setTransition(
    projectId: string,
    userId: string,
    episodeId: string,
    afterClipId: string,
    kind: string,
    durationSeconds: number,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (!(CUT_TRANSITION_KINDS as readonly string[]).includes(kind)) {
      return {
        error: { code: "VALIDATION_ERROR", message: `Unknown transition kind: ${kind}` },
        status: 400,
      }
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return {
        error: { code: "VALIDATION_ERROR", message: "durationSeconds must be a finite, non-negative number" },
        status: 400,
      }
    }

    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "setTransition")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    if (!cut.clips.some((c) => c.id === afterClipId)) {
      return { error: { code: "VALIDATION_ERROR", message: `afterClipId is not a clip: ${afterClipId}` }, status: 400 }
    }

    const transition: CutTransition = {
      afterClipId,
      kind: kind as CutTransition["kind"],
      durationSeconds,
    }
    const others = cut.transitions.filter((t) => t.afterClipId !== afterClipId)
    const transitions = [...others, transition]

    const result = await this.writeCut(dir, relativePath, { ...cut, transitions }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /** Remove the transition after `afterClipId` (no-op if none). */
  async clearTransition(
    projectId: string,
    userId: string,
    episodeId: string,
    afterClipId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "clearTransition")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const transitions = cut.transitions.filter((t) => t.afterClipId !== afterClipId)
    const result = await this.writeCut(dir, relativePath, { ...cut, transitions }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /** Set the Cut's single BGM audio bed reference. */
  async setBgm(
    projectId: string,
    userId: string,
    episodeId: string,
    bgm: CutAudioRef,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (typeof bgm?.artifactId !== "string" || bgm.artifactId.length === 0) {
      return { error: { code: "VALIDATION_ERROR", message: "bgm.artifactId is required" }, status: 400 }
    }
    const ref: CutAudioRef = { artifactId: bgm.artifactId }
    if (typeof bgm.gainDb === "number" && Number.isFinite(bgm.gainDb)) ref.gainDb = bgm.gainDb
    if (typeof bgm.inPoint === "number" && Number.isFinite(bgm.inPoint)) ref.inPoint = bgm.inPoint
    if (typeof bgm.outPoint === "number" && Number.isFinite(bgm.outPoint)) ref.outPoint = bgm.outPoint

    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "setBgm")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const result = await this.writeCut(dir, relativePath, { ...cut, bgm: ref }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /** Remove the Cut's BGM reference (no-op if none). */
  async clearBgm(
    projectId: string,
    userId: string,
    episodeId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "clearBgm")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const next: Omit<EpisodeCut, "updatedAt"> = {
      schemaVersion: 1,
      episodeId: cut.episodeId,
      clips: cut.clips,
      transitions: cut.transitions,
    }
    const result = await this.writeCut(dir, relativePath, next, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }
}

export const storyService = new StoryService()
