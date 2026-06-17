import { eq } from "drizzle-orm"
import { readFile, access, writeFile, rename } from "fs/promises"
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

// ── Safe file name patterns for episodes ──────────────────────────────────────

const SAFE_EPISODE_PATTERN = /^ep_[a-z0-9_]+\.json$/
const SAFE_EP_RELATED_PATTERN = /^ep_[a-z0-9_]+\.(workflow|runs)\.json$/

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
}

export const storyService = new StoryService()
