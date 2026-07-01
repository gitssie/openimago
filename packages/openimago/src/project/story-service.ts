import { eq } from "drizzle-orm"
import { readFile, access, writeFile, rename, mkdir } from "fs/promises"
import path from "path"
import { db } from "../db/client"
import { projects, users } from "../db/schema"
import { logger } from "../server/logger"
import { filmstripMeta, type FilmstripMeta } from "../media/filmstrip"
import { resolveDirectory as resolveSessionDirectory } from "../workdir/resolver"

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

// Cut clip ids (ADR 0008 #2: client mints the split id). Mirrors the shape of
// server-minted ids (`clip-<shotId>`, `<id>-b`): a leading alphanumeric
// followed by lowercase alphanumerics, hyphens, or underscores.
const SAFE_CLIP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

// ── Cut transition kinds (ADR 0006 edit layer) ────────────────────────────────

const CUT_TRANSITION_KINDS = ["cut", "dissolve", "fade"] as const

/** Whole milliseconds per second — the Cut is integer-ms end to end (cut schema
 *  v2, openimago-23cr): the only ×1000/÷1000 left lives at the boundaries that
 *  ingest seconds (assemble reads run/shot durations in seconds; migration lifts
 *  legacy v1 second fields). Everything downstream is bare integer ms. */
const MS_PER_S = 1000

/**
 * Fallback clip length (integer ms) used when assembling the first Cut for a shot
 * that carries no duration anywhere — neither its completed run's
 * result.duration nor the shot's durationEstimate. A clip's outPointMs must be
 * > inPointMs, so a positive default is required; the user re-trims on the timeline.
 */
const DEFAULT_ASSEMBLED_CLIP_MS = 5000

/** Run result media kinds that count as a clip's visual source (ADR 0006). */
const VISUAL_RUN_KINDS = new Set(["image", "video"])

/** Smallest legal clip span — a clip must cover at least 1ms of source. */
const MIN_CLIP_SPAN_MS = 1

/**
 * Force a clip's [inMs, outMs] into [0, sourceDurationMs] with inMs < outMs,
 * silently correcting any violation (openimago-lknv — Clamp: never block a write
 * or refuse to load). Pure: returns the corrected integer-ms range plus `clamped`;
 * the caller logs when `clamped` is true. Mirrors the web clampClipRange so the
 * write path and the front-end read paths share the same invariant. When
 * sourceDurationMs is missing/unusable the UPPER bound is not enforced (legacy v1
 * cuts carry no snapshot), while in >= 0 and in < out are always enforced.
 */
function clampClipRange(
  inMs: number,
  outMs: number,
  sourceDurationMs: number | null | undefined,
): { inPointMs: number; outPointMs: number; clamped: boolean } {
  const hasUpperBound =
    typeof sourceDurationMs === "number" && Number.isFinite(sourceDurationMs) && sourceDurationMs > 0
  const upper = hasUpperBound ? Math.round(sourceDurationMs) : Number.POSITIVE_INFINITY

  let inPointMs = Number.isFinite(inMs) ? Math.round(inMs) : 0
  let outPointMs = Number.isFinite(outMs)
    ? Math.round(outMs)
    : hasUpperBound
      ? upper
      : Math.round(Number.isFinite(inMs) ? inMs : 0)

  if (inPointMs < 0) inPointMs = 0
  if (inPointMs > upper) inPointMs = upper
  if (outPointMs > upper) outPointMs = upper

  if (outPointMs <= inPointMs) {
    if (inPointMs + MIN_CLIP_SPAN_MS <= upper) {
      outPointMs = inPointMs + MIN_CLIP_SPAN_MS
    } else {
      inPointMs = outPointMs - MIN_CLIP_SPAN_MS
    }
  }

  const clamped = inPointMs !== inMs || outPointMs !== outMs
  return { inPointMs, outPointMs, clamped }
}

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

/**
 * Same-origin placeholder image URLs committed under packages/web/public/mock/
 * (Quasar serves public/<name> at /<name>). External image hosts (picsum, CDNs)
 * are NOT reachable in the user's network, so — like the mock VIDEO clips
 * (MOCK_VIDEO_CLIPS) — generated mock images must be relative same-origin
 * URLs that need no internet. SVG renders directly in <img>.
 */
const MOCK_IMAGE_PLACEHOLDERS = [
  "/mock/placeholder-16x9.svg",
  "/mock/placeholder-3x4.svg",
  "/mock/placeholder-2x3.svg",
  "/mock/placeholder-1x1.svg",
] as const

/**
 * Browser-loadable mock image URL. Deterministic: a stable hash of `seed`
 * selects one of the committed same-origin placeholders, so the same shot
 * always maps to the same image while different shots vary. Relative URL →
 * resolved against the web app's own origin (no external network).
 */
function mockImageUrl(seed: string): string {
  const idx = stableHash(seed) % MOCK_IMAGE_PLACEHOLDERS.length
  return MOCK_IMAGE_PLACEHOLDERS[idx]!
}

/**
 * Same-origin per-shot mock clips committed under packages/web/public/mock/
 * (Quasar serves public/<name> at /<name>). omniclip is a video editor:
 * hydrateFromCut → importFromUrl needs a REAL, decodable video to build a video
 * effect, so a generated shot must yield an MP4, not a PNG (openimago-1s27).
 *
 * Same-origin matters twice (openimago-lwuu): (1) external CDN clips returned
 * HTTP 403 in this environment, breaking importFromUrl; (2) WebCodecs imposes
 * CORS on cross-origin video, which a relative same-origin URL sidesteps.
 *
 * Each clip ships with a committed `<name>.filmstrip.png` sprite (24 frames,
 * 28×50) and a known real duration (ffprobe of the committed mp4), so the
 * timeline filmstrip renders continuous distinct frames WITHOUT a runtime
 * ffmpeg dependency (openimago-0t9m). `durationSeconds` is the actual probed
 * length — reusing the values already baked into the seed fixture
 * (docs/story-schema/runs/ep_001.runs.json). Different shots map to different
 * clips so each timeline clip shows distinct footage. Replace with a real
 * provider as a follow-up, like mockImageUrl/mockAudioUrl.
 */
interface MockVideoClip {
  /** Servable preview URL — the committed per-shot mp4. */
  preview: string
  /** Servable sprite URL — the committed per-shot filmstrip png, beside the mp4. */
  filmstrip: string
  /** Real source duration in seconds (ffprobe of the committed mp4). */
  durationSeconds: number
}

const MOCK_VIDEO_CLIPS: readonly MockVideoClip[] = [
  { preview: "/mock/shot-s01.mp4", filmstrip: "/mock/shot-s01.filmstrip.png", durationSeconds: 15.069 },
  { preview: "/mock/shot-s02.mp4", filmstrip: "/mock/shot-s02.filmstrip.png", durationSeconds: 15.069 },
  { preview: "/mock/shot-s03.mp4", filmstrip: "/mock/shot-s03.filmstrip.png", durationSeconds: 10.054 },
  { preview: "/mock/shot-s04.mp4", filmstrip: "/mock/shot-s04.filmstrip.png", durationSeconds: 12.051 },
  { preview: "/mock/shot-s05.mp4", filmstrip: "/mock/shot-s05.filmstrip.png", durationSeconds: 12.051 },
  { preview: "/mock/shot-s06.mp4", filmstrip: "/mock/shot-s06.filmstrip.png", durationSeconds: 10.054 },
] as const

/**
 * Pick a mock clip for a shot. Deterministic: a stable hash of `seed` selects
 * one committed per-shot clip, so the same shot always maps to the same clip
 * while different shots vary across the catalog (distinct footage per timeline
 * clip). Mirrors mockImageUrl's selection style.
 */
function mockVideoClip(seed: string): MockVideoClip {
  const idx = stableHash(seed) % MOCK_VIDEO_CLIPS.length
  return MOCK_VIDEO_CLIPS[idx]!
}

/**
 * Default TTS voice used when a dialog line's character has no `voiceId`
 * (architect default, ADR 0004 — revisit when a real provider lands). A named
 * domain constant, not a hidden config value (global §9.3).
 */
const DEFAULT_VOICE_ID = "voice_default"

/**
 * Mock TTS provider (mirrors mockImageUrl for images, ADR 0005). Returns a
 * browser-loadable placeholder audio URL seeded from a stable hash of `seed`,
 * so re-synthesizing the same line yields a stable artifact. Replace with a
 * real provider as a follow-up.
 */
function mockAudioUrl(seed: string): string {
  return `https://cdn.openimago.local/mock-tts/${stableHash(seed).toString(36)}.mp3`
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
  /** Global audio beds (ADR 0004 audio layer): narration / BGM / SFX. */
  audioElements: Record<string, unknown>[]
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

/**
 * Per-shot AI video generation params (openimago-ciqk). Persisted on the shot by
 * generateShot so the clip context-menu 手动编辑 dialog re-opens pre-filled with the
 * params last used to (re)generate this shot's video. `prompt` is a generation
 * OVERRIDE — it does NOT replace the human-readable `description`.
 */
export interface ShotGenerationParams {
  prompt?: string
  model?: string
  aspectRatio?: string
  durationSeconds?: number
  /** Reference images (uploaded asset ids or media urls) the video model
   *  generates FROM (openimago-v1j0). Optional — absent/empty for text-only
   *  generation. Mirrors the web `ShotGenerationParams`. */
  referenceImages?: string[]
  /** Video generation mode (openimago-ggxt) — the generation TYPE the chosen model
   *  runs in (e.g. 全能参考 / 图生视频). Available modes depend on the model (owned by
   *  the web CLIP_GENERATION_MODE_OPTIONS). Recorded/persisted like aspectRatio;
   *  per-mode input variations are a follow-up. Mirrors the web type. */
  generationMode?: string
  /** Output resolution tier (e.g. 720p / 1080p). Recorded/persisted like aspectRatio;
   *  Pro-gating / charge flow is a deferred billing follow-up. Mirrors the web type. */
  resolution?: string
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
  /** Last-used AI generation params (openimago-ciqk); absent until first generate. */
  generationParams?: ShotGenerationParams
}

/** A generation run appended to runs.json (ADR 0004 GenerationRun). */
export interface GenerationRun {
  id: string
  nodeId: string
  /** Shot this run belongs to, or null for Bible-level concept art (Character /
   *  Scene design) which is shot-less and linked only to a Workflow node via
   *  nodeId (CONTEXT.md Run; seed docs/story-schema/runs/ep_001.runs.json). */
  shotId: string | null
  status: string
  params: {
    prompt: string
    model: string
    // Video generation params from the 手动编辑 re-gen dialog (openimago-ciqk).
    // Recorded when supplied so the run history reflects the exact request.
    aspectRatio?: string
    durationSeconds?: number
    // Reference images the video model generates FROM (openimago-v1j0): asset ids
    // or media urls. Recorded for the future image-to-video provider (PROVIDER SEAM).
    referenceImages?: string[]
    // Video generation mode (openimago-ggxt): the generation type the model ran in.
    generationMode?: string
    // Output resolution tier (e.g. 720p / 1080p): recorded for run history.
    resolution?: string
    // Voiceover runs (ADR 0004 ResolvedRunParams) carry the speaking line's
    // character, resolved voice, text, and an optional TTS style from emotion.
    characterId?: string
    voiceId?: string
    text?: string
    style?: string
  }
  result: {
    artifactId: string
    kind: string
    mime: string
    filename: string
    access: { preview: string; thumbnail: string; filmstrip?: string }
    // Real source duration in seconds (video runs). The timeline derives clip
    // width + filmstrip cell→frame mapping from this; matches the seed fixture
    // shape (docs/story-schema/runs/ep_001.runs.json).
    duration?: number
    // Precomputed filmstrip sprite dims, alongside access.filmstrip.
    filmstrip?: FilmstripMeta
  }
  startedAt: string
  completedAt: string
  /** When this run is an ADR 0003 artifact rerun, the result.artifactId of the
   *  source run it was re-executed from. Immutably links rerun output → source
   *  so the panel can trace a variation back to what it came from. Absent on
   *  ordinary (non-rerun) runs. */
  parentArtifactId?: string
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

/** The current on-disk cut.json schema version (openimago-23cr). v2 stores clip
 *  trim points as integer milliseconds; v1 (legacy) stored them as float seconds
 *  and is lifted on read by migrateCutToV2. */
const CUT_SCHEMA_VERSION = 2

/** A trimmed slice of a source Shot's media on the video track. inPointMs/outPointMs
 *  are integer milliseconds (cut schema v2, openimago-23cr) — same unit as the
 *  client domain, omniclip state, and disk: zero conversion across the link. */
export interface CutClip {
  id: string
  sourceShotId: string
  inPointMs: number
  outPointMs: number
  order: number
  /** Persisted snapshot of the source media's real length in integer ms
   *  (openimago-lknv): written by assemble from the source shot's primary video
   *  run; trim/split clamp the range into [0, sourceDurationMs]. Optional — legacy
   *  v1 cuts migrated without a snapshot omit it (upper bound then not enforced). */
  sourceDurationMs?: number
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

/** Edit-layer state for an episode — its own optimistic-concurrency clock.
 *  schemaVersion 2: clip trim points are integer ms (openimago-23cr). */
export interface EpisodeCut {
  schemaVersion: 2
  episodeId: string
  clips: CutClip[]
  transitions: CutTransition[]
  bgm?: CutAudioRef
  updatedAt: string
}

/** Legacy v1 cut.json clip — float-seconds trim points, lifted to v2 on read. */
interface LegacyCutClipV1 {
  id: string
  sourceShotId: string
  inPoint: number
  outPoint: number
  order: number
}

// ── Service ───────────────────────────────────────────────────────────────────

export class StoryService {
  /**
   * Resolve a Story workspace directory from a project key OR a standalone
   * session key, with ownership check (ADR 0009). Story files live inside the
   * directory; the key is only used to look up that directory + verify the
   * caller may reach it. The directory is the single storage entity behind both
   * a project (`projects.directory`, owned via `projects.userId`) and a session
   * (`session.directory`, owned via `session.workspace_id`).
   */
  private async resolveWorkspaceDir(
    key: { projectId: string } | { sessionId: string },
    userId: string,
  ): Promise<string | { error: { code: string; message: string }; status: number }> {
    if ("sessionId" in key) {
      // Map userId → workspaceId (the link projects.userId provides for the
      // project branch), then reuse the shared session resolver, which checks
      // session existence + workspace ownership.
      const [user] = await db
        .select({ workspaceId: users.workspaceId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user?.workspaceId) {
        logger.warn({ userId, sessionId: key.sessionId }, "story: forbidden — no workspace for user")
        return { error: { code: "FORBIDDEN", message: "Not workspace owner" }, status: 403 }
      }

      const resolved = await resolveSessionDirectory(key.sessionId, user.workspaceId)
      if ("status" in resolved) {
        return { error: { code: resolved.code, message: resolved.message }, status: resolved.status }
      }
      return resolved.directory
    }

    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, key.projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }

    const project = rows[0]!

    if (project.userId !== userId) {
      logger.warn({ userId, projectId: key.projectId }, "story: forbidden — not project owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }

    return project.directory
  }

  /**
   * Thin wrapper kept for the story method bodies, which pass a single id
   * string. Reached via `/projects/:id/story/*` the id is a project id; reached
   * via `/sessions/:id/story/*` (ADR 0009) it is a session id. Project and
   * session ids occupy disjoint id-spaces, so resolve-as-project first and fall
   * back to resolve-as-session only when the id matches no project (NOT_FOUND).
   * A project owned by another user returns FORBIDDEN without falling through —
   * it IS a project, just not this caller's.
   */
  private async resolveProjectDir(
    id: string,
    userId: string,
  ): Promise<string | { error: { code: string; message: string }; status: number }> {
    const asProject = await this.resolveWorkspaceDir({ projectId: id }, userId)
    if (typeof asProject !== "string" && asProject.status === 404) {
      return this.resolveWorkspaceDir({ sessionId: id }, userId)
    }
    return asProject
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
   * mock VIDEO result (model = "mock-video-model", kind = "video", a playable
   * sample MP4, artifactId = mock_*) and flips the shot's status to "generated".
   * Video (not a still image) so omniclip's Cut timeline can hydrate the clip as
   * a video effect (openimago-1s27). A real provider is a follow-up.
   *
   * runs.json is append-only (no updatedAt, no 409). The episode write reuses
   * the optimistic episode write path (atomic + bumped updatedAt).
   */
  async generateShot(
    projectId: string,
    userId: string,
    episodeId: string,
    shotId: string,
    params?: ShotGenerationParams,
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

    // ── Generation params (openimago-ciqk) ──
    // The 手动编辑 dialog posts an edited prompt + model/aspect/duration. Use the
    // edited prompt when supplied (else fall back to the shot description); the
    // mock provider keys its clip on the prompt, so editing it changes the media.
    const promptOverride = typeof params?.prompt === "string" ? params.prompt.trim() : ""
    const prompt = promptOverride || description.trim() || `shot ${shotNumber}`
    const model =
      typeof params?.model === "string" && params.model.trim()
        ? params.model.trim()
        : "mock-video-model"
    const aspectRatio =
      typeof params?.aspectRatio === "string" && params.aspectRatio.trim()
        ? params.aspectRatio.trim()
        : undefined
    const durationSeconds =
      typeof params?.durationSeconds === "number" && Number.isFinite(params.durationSeconds)
        ? params.durationSeconds
        : undefined
    // Reference images the video model generates FROM (openimago-v1j0): asset ids
    // or media urls. Keep only non-empty strings; undefined when none supplied.
    const referenceImages =
      Array.isArray(params?.referenceImages)
        ? params.referenceImages.filter(
            (r): r is string => typeof r === "string" && r.trim().length > 0,
          )
        : undefined
    const hasReferenceImages = Array.isArray(referenceImages) && referenceImages.length > 0
    // Video generation mode (openimago-ggxt): recorded/persisted like aspectRatio.
    const generationMode =
      typeof params?.generationMode === "string" && params.generationMode.trim()
        ? params.generationMode.trim()
        : undefined
    // Output resolution tier: recorded/persisted like aspectRatio.
    const resolution =
      typeof params?.resolution === "string" && params.resolution.trim()
        ? params.resolution.trim()
        : undefined

    // ── Mock provider result (playable MP4, like opencode mockVideoProvider) ──
    // Deterministic per-shot clip with a committed filmstrip sprite + real
    // duration, so the timeline renders continuous distinct frames (openimago-0t9m).
    // PROVIDER SEAM (openimago-v1j0): referenceImages are recorded on run.params and
    // carried to this mock boundary, but buildMockVideoRun does NOT condition its
    // output on them — real Seedance image-to-video is a bounded follow-up. When the
    // real provider is wired, pass `referenceImages` into its request here.
    const now = new Date().toISOString()
    const run = this.buildMockVideoRun(shotId, {
      prompt,
      model,
      aspectRatio,
      durationSeconds,
      ...(hasReferenceImages ? { referenceImages } : {}),
      ...(generationMode !== undefined ? { generationMode } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
    })

    // ── Append to runs.json (append-only; initialize when missing) ──
    const runsWrite = await this.appendRun(dir, projectId, episodeId, run)
    if ("error" in runsWrite) return runsWrite

    // ── Flip shot status → generated + persist the chosen generation params ──
    // (openimago-ciqk) Only when params were actually supplied (手动编辑 dialog), so
    // a plain 重新生成 (no body) never clobbers a shot's stored params. Merge over any
    // existing params so an unchanged field survives. (Atomic write + bump updatedAt.)
    const suppliedParams: ShotGenerationParams = {
      ...(promptOverride ? { prompt: promptOverride } : {}),
      ...(typeof params?.model === "string" && params.model.trim() ? { model } : {}),
      ...(aspectRatio !== undefined ? { aspectRatio } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(hasReferenceImages ? { referenceImages } : {}),
      ...(generationMode !== undefined ? { generationMode } : {}),
      ...(resolution !== undefined ? { resolution } : {}),
    }
    const hasSuppliedParams = Object.keys(suppliedParams).length > 0
    const updatedShots = shots.map((s, i) => {
      if (i !== shotIdx) return s
      const next: Record<string, unknown> = { ...s, status: "generated" }
      if (hasSuppliedParams) {
        const existing = (s["generationParams"] as ShotGenerationParams) ?? {}
        next["generationParams"] = { ...existing, ...suppliedParams }
      }
      return next
    })
    const updatedEpisode: StoryEpisode = {
      ...episode,
      shots: updatedShots,
      updatedAt: now,
    }
    const epWrite = await this.writeJsonFileAtomic(dir, episodePath, updatedEpisode, projectId)
    if ("error" in epWrite) return epWrite

    return { data: { run }, status: 200 }
  }

  /**
   * Re-execute a prior GenerationRun behind `artifactId` (ADR 0003 artifact-panel
   * rerun, openimago-wc96). Locates the source run by its `result.artifactId` in
   * the episode's runs.json, re-runs the SAME media-generation path as generateShot
   * with that run's persisted params (optional `overrides` win per field, mirroring
   * the parameter editor), and appends a NEW run. Immutable per ADR 0003: the
   * source run and the shot are never mutated — only a new run is appended, linked
   * back via `parentArtifactId` for traceability.
   *
   * This is the ARTIFACT rerun, distinct from shot 重新生成 (`generateShot`), which
   * also flips shot status + persists params.
   *
   * Billing note: media-generation cost (image/video) is charged INLINE by the
   * media service (openimago-xqr) — it does NOT flow through session.cost/CDC.
   * Because rerun reuses the same media-gen path (`buildMockVideoRun`, the mock
   * stand-in for that service), it inherits that inline charge automatically once
   * xqr lands; there is deliberately no bespoke charge here.
   */
  async rerunArtifact(
    projectId: string,
    userId: string,
    episodeId: string,
    artifactId: string,
    overrides?: ShotGenerationParams,
  ): Promise<
    | { data: { run: GenerationRun }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const runsFile = `${episodeId}.runs.json`
    if (!SAFE_EP_RELATED_PATTERN.test(runsFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (rerunArtifact)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }
    if (!artifactId) {
      return { error: { code: "VALIDATION_ERROR", message: "artifactId is required" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir // 403 non-owner / 404 missing project/session

    // ── Locate the source run by its result.artifactId ──
    const runsPath = `${STORY_RUNS_DIR}/${runsFile}`
    const runsRead = await this.readJsonFile<StoryRuns>(dir, runsPath, projectId)
    const existingRuns =
      "error" in runsRead || !Array.isArray(runsRead.data.runs) ? [] : runsRead.data.runs
    const prior = existingRuns.find(
      (r) => (r as { result?: { artifactId?: unknown } }).result?.artifactId === artifactId,
    )
    if (!prior) {
      return { error: { code: "NOT_FOUND", message: `Artifact not found: ${artifactId}` }, status: 404 }
    }

    // ── Resolve params: prior run params as the base, overrides win per field ──
    const priorParams = ((prior as { params?: Record<string, unknown> }).params ?? {}) as Record<
      string,
      unknown
    >
    const shotId = typeof (prior as { shotId?: unknown }).shotId === "string"
      ? (prior as { shotId: string }).shotId
      : ""

    const overridePrompt = typeof overrides?.prompt === "string" ? overrides.prompt.trim() : ""
    const priorPrompt = typeof priorParams["prompt"] === "string" ? (priorParams["prompt"] as string) : ""
    const prompt = overridePrompt || priorPrompt || `shot ${shotId}`

    const overrideModel =
      typeof overrides?.model === "string" && overrides.model.trim() ? overrides.model.trim() : ""
    const priorModel =
      typeof priorParams["model"] === "string" && (priorParams["model"] as string).trim()
        ? (priorParams["model"] as string)
        : ""
    const model = overrideModel || priorModel || "mock-video-model"

    const aspectRatio =
      typeof overrides?.aspectRatio === "string" && overrides.aspectRatio.trim()
        ? overrides.aspectRatio.trim()
        : typeof priorParams["aspectRatio"] === "string" && (priorParams["aspectRatio"] as string).trim()
          ? (priorParams["aspectRatio"] as string)
          : undefined

    const durationSeconds =
      typeof overrides?.durationSeconds === "number" && Number.isFinite(overrides.durationSeconds)
        ? overrides.durationSeconds
        : typeof priorParams["durationSeconds"] === "number" &&
            Number.isFinite(priorParams["durationSeconds"] as number)
          ? (priorParams["durationSeconds"] as number)
          : undefined

    // ── Re-execute (same media-gen path) + append a NEW run (append-only) ──
    const run = this.buildMockVideoRun(
      shotId,
      { prompt, model, aspectRatio, durationSeconds },
      { parentArtifactId: artifactId },
    )
    const runsWrite = await this.appendRun(dir, projectId, episodeId, run)
    if ("error" in runsWrite) return runsWrite

    return { data: { run }, status: 200 }
  }

  /**
   * Generate concept art for a Bible element (Character / Scene design,
   * openimago-ugy9). Per CONTEXT.md, Bible-level concept art is a Run with
   * `shotId: null` linked only to a Workflow node — so this appends an image-kind
   * run with the element id on `nodeId` (the left-panel element card resolves its
   * thumbnail by matching nodeId ⊇ element-id token; mapper.runNodeMatchesElement).
   * Reuses the shared media-gen path (`buildMockImageRun` / `appendRun`).
   *
   * This is the 关键元素 "评论生成" op — distinct from shot generation (which is video
   * + flips shot status). Billing note: like shot generation, media cost is billed
   * INLINE by the media service (openimago-xqr), reusing the same media-gen path —
   * not via session.cost/CDC.
   */
  async generateElementConcept(
    projectId: string,
    userId: string,
    episodeId: string,
    elementId: string,
    params?: { prompt?: string; model?: string },
  ): Promise<
    | { data: { run: GenerationRun }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (!SAFE_EP_RELATED_PATTERN.test(`${episodeId}.runs.json`)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (generateElementConcept)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }
    if (!elementId) {
      return { error: { code: "VALIDATION_ERROR", message: "elementId is required" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir // 403 non-owner / 404 missing project/session

    // ── Resolve the element from the Bible (character or scene) ──
    const bibleRead = await this.readJsonFile<StoryBible>(dir, CANONICAL_BIBLE, projectId)
    if ("error" in bibleRead) return bibleRead
    const bible = bibleRead.data
    const characters = Array.isArray(bible.characters) ? bible.characters : []
    const scenes = Array.isArray(bible.scenes) ? bible.scenes : []
    const element =
      characters.find((c) => String(c["id"] ?? "") === elementId) ??
      scenes.find((s) => String(s["id"] ?? "") === elementId)
    if (!element) {
      return { error: { code: "NOT_FOUND", message: `Bible element not found: ${elementId}` }, status: 404 }
    }

    // ── Resolve params: posted prompt/model win, else the element's authored copy ──
    const elementName = typeof element["name"] === "string" ? element["name"] : ""
    const elementDescription = typeof element["description"] === "string" ? element["description"] : ""
    const promptOverride = typeof params?.prompt === "string" ? params.prompt.trim() : ""
    const prompt = promptOverride || elementDescription.trim() || elementName.trim() || `concept ${elementId}`
    const model =
      typeof params?.model === "string" && params.model.trim() ? params.model.trim() : "mock-image-model"

    // ── Build the shot-less concept-art image run + append (append-only) ──
    const run = this.buildMockImageRun(elementId, { prompt, model })
    const runsWrite = await this.appendRun(dir, projectId, episodeId, run)
    if ("error" in runsWrite) return runsWrite

    return { data: { run }, status: 200 }
  }

  /**
   * Build a completed mock-video GenerationRun for a shot from resolved params —
   * the shared media-generation path for both shot generation (`generateShot`) and
   * artifact rerun (`rerunArtifact`). The mock provider keys its clip on the prompt,
   * so editing the prompt changes the media. A real provider (openimago-xqr) slots
   * in here behind the same signature, inheriting both call sites + its inline charge.
   */
  private buildMockVideoRun(
    shotId: string,
    resolved: {
      prompt: string
      model: string
      aspectRatio?: string
      durationSeconds?: number
      referenceImages?: string[]
      generationMode?: string
      resolution?: string
    },
    extra?: { parentArtifactId?: string },
  ): GenerationRun {
    const clip = mockVideoClip(`${shotId}${resolved.prompt}`)
    const now = new Date().toISOString()
    return {
      id: `run_${randomSlug()}`,
      nodeId: "",
      shotId,
      status: "completed",
      params: {
        prompt: resolved.prompt,
        model: resolved.model,
        ...(resolved.aspectRatio !== undefined ? { aspectRatio: resolved.aspectRatio } : {}),
        ...(resolved.durationSeconds !== undefined ? { durationSeconds: resolved.durationSeconds } : {}),
        // PROVIDER SEAM (openimago-v1j0): recorded for the future image-to-video
        // provider; the mock output is NOT conditioned on these.
        ...(resolved.referenceImages && resolved.referenceImages.length > 0
          ? { referenceImages: resolved.referenceImages }
          : {}),
        ...(resolved.generationMode !== undefined
          ? { generationMode: resolved.generationMode }
          : {}),
        ...(resolved.resolution !== undefined ? { resolution: resolved.resolution } : {}),
      },
      result: {
        artifactId: `mock_${randomSlug()}`,
        kind: "video",
        mime: "video/mp4",
        filename: `${shotId}.mp4`,
        access: { preview: clip.preview, thumbnail: clip.preview, filmstrip: clip.filmstrip },
        duration: clip.durationSeconds,
        filmstrip: filmstripMeta(),
      },
      startedAt: now,
      completedAt: now,
      ...(extra?.parentArtifactId ? { parentArtifactId: extra.parentArtifactId } : {}),
    }
  }

  /**
   * Build a completed mock-image GenerationRun for Bible concept art (openimago-ugy9).
   * Shot-less (`shotId: null`); `nodeId` is set to the element id so the element
   * card resolves this thumbnail. The mock provider keys its image on the prompt,
   * so editing the prompt changes the media. A real image provider (openimago-xqr)
   * slots in behind this same signature.
   */
  private buildMockImageRun(
    elementId: string,
    resolved: { prompt: string; model: string },
  ): GenerationRun {
    const url = mockImageUrl(`${elementId}${resolved.prompt}`)
    const now = new Date().toISOString()
    const artifactId = `mock_${randomSlug()}`
    return {
      id: `run_${randomSlug()}`,
      nodeId: elementId,
      shotId: null,
      status: "completed",
      params: { prompt: resolved.prompt, model: resolved.model },
      result: {
        artifactId,
        kind: "image",
        mime: "image/svg+xml",
        filename: `${elementId}-${artifactId}.svg`,
        access: { preview: url, thumbnail: url },
      },
      startedAt: now,
      completedAt: now,
    }
  }

  /**
   * Append a run to story/runs/ep_NNN.runs.json (append-only; initialize the doc
   * when the file is missing). Shared by `generateShot` and `rerunArtifact`.
   */
  private async appendRun(
    dir: string,
    projectId: string,
    episodeId: string,
    run: GenerationRun,
  ): Promise<{ status: 200 } | { error: { code: string; message: string }; status: number }> {
    const runsFile = `${episodeId}.runs.json`
    if (!SAFE_EP_RELATED_PATTERN.test(runsFile)) {
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }
    const runsPath = `${STORY_RUNS_DIR}/${runsFile}`
    const runsRead = await this.readJsonFile<StoryRuns>(dir, runsPath, projectId)
    const runsDoc: StoryRuns =
      "error" in runsRead ? { schemaVersion: 1, episodeId, runs: [] } : runsRead.data
    const existingRuns = Array.isArray(runsDoc.runs) ? runsDoc.runs : []
    const updatedRuns: StoryRuns = {
      ...runsDoc,
      schemaVersion: runsDoc.schemaVersion ?? 1,
      episodeId: runsDoc.episodeId ?? episodeId,
      runs: [...existingRuns, run as unknown as Record<string, unknown>],
    }
    return this.writeJsonFileAtomic(dir, runsPath, updatedRuns, projectId)
  }

  /**
   * Generate voiceover (VO) for an episode or a single shot (ADR 0004 — audio
   * Runs). For each ShotDialog line with non-empty text, synthesize a TTS audio
   * artifact and append a completed GenerationRun with kind:"audio" and shotId
   * set — mirroring generateShot's run-append. The voice is resolved from the
   * speaking character's BibleCharacter.voiceId, falling back to DEFAULT_VOICE_ID;
   * a dialog `emotion` maps to the run's `style` param when present.
   *
   * THIS IS A MOCK PROVIDER (like generateShot mocks images): it appends runs
   * with a placeholder audio URL and does not call a real TTS service.
   *
   * VO is DERIVED state: runs.json is append-only (no updatedAt, no 409) and the
   * timeline projects these audio Runs under their clips. This never writes to
   * cut.json and never mutates episode.json (consistent with the assembler
   * skipping audio runs).
   */
  async generateVoiceover(
    projectId: string,
    userId: string,
    episodeId: string,
    shotId?: string,
  ): Promise<
    | { data: { runs: GenerationRun[] }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const safeEpisodeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeEpisodeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (generateVoiceover)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const epRead = await this.readJsonFile<StoryEpisode>(dir, `${STORY_EPISODES_DIR}/${safeEpisodeFile}`, projectId)
    if ("error" in epRead) return epRead
    const episode = epRead.data

    const shots = Array.isArray(episode.shots) ? episode.shots : []

    // Target shots: one named shot, or all shots for an episode-wide pass.
    let targetShots = shots
    if (shotId !== undefined) {
      const shot = shots.find((s) => String(s["id"] ?? "") === shotId)
      if (!shot) return { error: { code: "NOT_FOUND", message: `Shot not found: ${shotId}` }, status: 404 }
      targetShots = [shot]
    }

    // Voice map from the bible (best-effort — missing bible → all default voice).
    const voiceByCharacter = new Map<string, string>()
    const bibleRead = await this.readJsonFile<StoryBible>(dir, CANONICAL_BIBLE, projectId)
    if (!("error" in bibleRead)) {
      const characters = Array.isArray(bibleRead.data.characters) ? bibleRead.data.characters : []
      for (const ch of characters) {
        const id = String(ch["id"] ?? "")
        const voiceId = ch["voiceId"]
        if (id && typeof voiceId === "string" && voiceId.length > 0) voiceByCharacter.set(id, voiceId)
      }
    }

    // Synthesize one audio run per non-empty dialog line.
    const newRuns: GenerationRun[] = []
    const now = new Date().toISOString()
    for (const shot of targetShots) {
      const sId = String(shot["id"] ?? "")
      const dialog = Array.isArray(shot["dialog"]) ? (shot["dialog"] as Record<string, unknown>[]) : []
      for (const line of dialog) {
        const text = typeof line["text"] === "string" ? line["text"] : ""
        if (text.trim().length === 0) continue

        const characterId = typeof line["characterId"] === "string" ? line["characterId"] : ""
        const voiceId = voiceByCharacter.get(characterId) ?? DEFAULT_VOICE_ID
        const emotion = typeof line["emotion"] === "string" && line["emotion"].length > 0 ? line["emotion"] : undefined

        const artifactId = `mockvo_${randomSlug()}`
        const audioUrl = mockAudioUrl(`${sId}${characterId}${text}${voiceId}`)
        const params: GenerationRun["params"] = {
          prompt: text,
          model: "mock-tts-model",
          characterId,
          voiceId,
          text,
          ...(emotion !== undefined ? { style: emotion } : {}),
        }
        newRuns.push({
          id: `run_${randomSlug()}`,
          nodeId: "",
          shotId: sId,
          status: "completed",
          params,
          result: {
            artifactId,
            kind: "audio",
            mime: "audio/mpeg",
            filename: `${sId}-${artifactId}.mp3`,
            access: { preview: audioUrl, thumbnail: audioUrl },
          },
          startedAt: now,
          completedAt: now,
        })
      }
    }

    // Append to runs.json (append-only; initialize when missing) — same path as
    // generateShot. No writes to episode.json or cut.json (VO is derived).
    const runsFile = `${episodeId}.runs.json`
    if (!SAFE_EP_RELATED_PATTERN.test(runsFile)) {
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }
    const runsPath = `${STORY_RUNS_DIR}/${runsFile}`
    const runsRead = await this.readJsonFile<StoryRuns>(dir, runsPath, projectId)
    const runsDoc: StoryRuns = "error" in runsRead ? { schemaVersion: 1, episodeId, runs: [] } : runsRead.data
    const existingRuns = Array.isArray(runsDoc.runs) ? runsDoc.runs : []
    const updatedRuns: StoryRuns = {
      ...runsDoc,
      schemaVersion: runsDoc.schemaVersion ?? 1,
      episodeId: runsDoc.episodeId ?? episodeId,
      runs: [...existingRuns, ...(newRuns as unknown as Record<string, unknown>[])],
    }
    const runsWrite = await this.writeJsonFileAtomic(dir, runsPath, updatedRuns, projectId)
    if ("error" in runsWrite) return runsWrite

    return { data: { runs: newRuns }, status: 200 }
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
    return { schemaVersion: CUT_SCHEMA_VERSION, episodeId, clips: [], transitions: [], updatedAt: "" }
  }

  /**
   * Lift a raw cut.json document to the current schema (v2 — integer-ms clip
   * trim points, openimago-23cr). A v1 doc (no schemaVersion 2; clips carry
   * float-seconds `inPoint`/`outPoint`) is migrated by rounding `seconds × 1000`
   * to whole ms; a doc already at v2 is returned unchanged. Read-path only — the
   * write path re-stamps `schemaVersion: CUT_SCHEMA_VERSION`, so the upgrade is
   * persisted the next time the cut is written. Tolerant: unknown fields are
   * preserved (transitions/bgm stay in seconds — they are out of scope for the
   * ms migration), orphan clips are never dropped.
   */
  private migrateCutToV2(raw: unknown, episodeId: string): EpisodeCut {
    const doc = (raw ?? {}) as Record<string, unknown>
    const version = typeof doc["schemaVersion"] === "number" ? (doc["schemaVersion"] as number) : 1
    const rawClips = Array.isArray(doc["clips"]) ? (doc["clips"] as Record<string, unknown>[]) : []

    const clips: CutClip[] = rawClips.map((c) => {
      if (version >= 2) {
        // Already ms — pass the trim points through verbatim. sourceDurationMs is
        // carried through when present; a v2 cut written before the snapshot field
        // existed (openimago-lknv) simply omits it (upper bound not enforced).
        const clip: CutClip = {
          id: String(c["id"] ?? ""),
          sourceShotId: String(c["sourceShotId"] ?? ""),
          inPointMs: Number(c["inPointMs"] ?? 0),
          outPointMs: Number(c["outPointMs"] ?? 0),
          order: Number(c["order"] ?? 0),
        }
        if (typeof c["sourceDurationMs"] === "number" && Number.isFinite(c["sourceDurationMs"])) {
          clip.sourceDurationMs = c["sourceDurationMs"]
        }
        return clip
      }
      // v1 → v2: round seconds × 1000 to whole ms.
      const legacy = c as unknown as LegacyCutClipV1
      return {
        id: String(legacy.id ?? ""),
        sourceShotId: String(legacy.sourceShotId ?? ""),
        inPointMs: Math.round(Number(legacy.inPoint ?? 0) * MS_PER_S),
        outPointMs: Math.round(Number(legacy.outPoint ?? 0) * MS_PER_S),
        order: Number(legacy.order ?? 0),
      }
    })

    const transitions = Array.isArray(doc["transitions"]) ? (doc["transitions"] as CutTransition[]) : []

    const cut: EpisodeCut = {
      schemaVersion: CUT_SCHEMA_VERSION,
      episodeId: typeof doc["episodeId"] === "string" ? (doc["episodeId"] as string) : episodeId,
      clips,
      transitions,
      updatedAt: typeof doc["updatedAt"] === "string" ? (doc["updatedAt"] as string) : "",
    }
    if (doc["bgm"] && typeof doc["bgm"] === "object") {
      cut.bgm = doc["bgm"] as CutAudioRef
    }
    return cut
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

    const read = await this.readJsonFile<unknown>(dir, relativePath, projectId)
    if ("error" in read) {
      // Missing file → lazily empty Cut. Any other error is forwarded.
      if (read.status === 404) return { data: this.emptyCut(episodeId), status: 200 }
      return read
    }
    // Lift legacy v1 (float-seconds) cut files to v2 (integer ms) on read.
    return { data: this.migrateCutToV2(read.data, episodeId), status: 200 }
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

    const read = await this.readJsonFile<unknown>(dir, relativePath, projectId)
    let cut: EpisodeCut
    if ("error" in read) {
      if (read.status !== 404) return read
      cut = this.emptyCut(episodeId)
    } else {
      // Lift legacy v1 (float-seconds) cut files to v2 (integer ms) on read; the
      // subsequent write re-stamps schemaVersion 2, persisting the upgrade.
      cut = this.migrateCutToV2(read.data, episodeId)
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
    const doc: EpisodeCut = { ...cut, schemaVersion: CUT_SCHEMA_VERSION, updatedAt: now }
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
   * Trim one clip's in/out points (integer ms, cut schema v2). Both bounds must
   * be finite numbers with inPointMs < outPointMs and inPointMs >= 0.
   */
  async trimClip(
    projectId: string,
    userId: string,
    episodeId: string,
    clipId: string,
    inPointMs: number,
    outPointMs: number,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (
      !Number.isFinite(inPointMs) ||
      !Number.isFinite(outPointMs) ||
      inPointMs < 0 ||
      inPointMs >= outPointMs
    ) {
      return {
        error: { code: "VALIDATION_ERROR", message: "Require finite inPointMs >= 0 and inPointMs < outPointMs" },
        status: 400,
      }
    }

    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "trimClip")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const idx = cut.clips.findIndex((c) => c.id === clipId)
    if (idx < 0) return { error: { code: "NOT_FOUND", message: `Clip not found: ${clipId}` }, status: 404 }

    const target = cut.clips[idx]!
    // Clamp the requested range into [0, sourceDurationMs] before storing so the
    // persisted range never exceeds the source snapshot (openimago-lknv). Silent
    // correction + warn — the input validation above already rejected malformed
    // requests; this caps an over-long out against the clip's own source length.
    const range = clampClipRange(inPointMs, outPointMs, target.sourceDurationMs)
    if (range.clamped) {
      logger.warn(
        { projectId, episodeId, clipId, requested: { inPointMs, outPointMs }, sourceDurationMs: target.sourceDurationMs, clamped: range },
        "story: trim range clamped to source bounds",
      )
    }

    const clips = cut.clips.map((c, i) =>
      i === idx ? { ...c, inPointMs: range.inPointMs, outPointMs: range.outPointMs } : c,
    )
    const result = await this.writeCut(dir, relativePath, { ...cut, clips }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /**
   * Split one clip at `atMs` (an absolute source time in integer ms,
   * inPointMs < t < outPointMs) into two consecutive clips sharing the source.
   * The first keeps the original id and [inPointMs, t); the second is a new clip
   * with [t, outPointMs) and the client-supplied `newClipId` (ADR 0008 #2: the
   * client owns clip-id minting so `omniclip effect id === CutClip.id` holds by
   * construction). All clip orders are re-indexed 0..N-1.
   */
  async splitClip(
    projectId: string,
    userId: string,
    episodeId: string,
    clipId: string,
    atMs: number,
    newClipId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string; newClipId: string }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    if (typeof newClipId !== "string" || !SAFE_CLIP_ID_PATTERN.test(newClipId)) {
      return {
        error: { code: "VALIDATION_ERROR", message: "newClipId must be a non-empty safe slug" },
        status: 400,
      }
    }

    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "splitClip")
    if ("error" in loaded) return loaded
    const { dir, relativePath, cut } = loaded

    const idx = cut.clips.findIndex((c) => c.id === clipId)
    if (idx < 0) return { error: { code: "NOT_FOUND", message: `Clip not found: ${clipId}` }, status: 404 }

    const target = cut.clips[idx]!
    if (!Number.isFinite(atMs) || atMs <= target.inPointMs || atMs >= target.outPointMs) {
      return {
        error: { code: "VALIDATION_ERROR", message: "atMs must be strictly within the clip's in/out range" },
        status: 400,
      }
    }

    if (cut.clips.some((c) => c.id === newClipId)) {
      return { error: { code: "VALIDATION_ERROR", message: "newClipId already in use" }, status: 400 }
    }

    // Both halves clamp into [0, sourceDurationMs] and inherit the source snapshot
    // (openimago-lknv) so the range invariant survives the split.
    const first = clampClipRange(target.inPointMs, atMs, target.sourceDurationMs)
    const second = clampClipRange(atMs, target.outPointMs, target.sourceDurationMs)
    if (first.clamped || second.clamped) {
      logger.warn(
        { projectId, episodeId, clipId, atMs, sourceDurationMs: target.sourceDurationMs },
        "story: split halves clamped to source bounds",
      )
    }
    const firstHalf: CutClip = {
      ...target,
      inPointMs: first.inPointMs,
      outPointMs: first.outPointMs,
    }
    const secondHalf: CutClip = {
      id: newClipId,
      sourceShotId: target.sourceShotId,
      inPointMs: second.inPointMs,
      outPointMs: second.outPointMs,
      order: 0,
      ...(target.sourceDurationMs !== undefined ? { sourceDurationMs: target.sourceDurationMs } : {}),
    }

    const spliced = [...cut.clips.slice(0, idx), firstHalf, secondHalf, ...cut.clips.slice(idx + 1)]
    const clips = spliced.map((c, i) => ({ ...c, order: i }))

    const result = await this.writeCut(dir, relativePath, { ...cut, clips }, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt, newClipId }, status: 200 }
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
      schemaVersion: CUT_SCHEMA_VERSION,
      episodeId: cut.episodeId,
      clips: cut.clips,
      transitions: cut.transitions,
    }
    const result = await this.writeCut(dir, relativePath, next, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt }, status: 200 }
  }

  /**
   * Assemble the first Cut from an episode's shots (ADR 0006 — "粗剪版本已生成",
   * the agent-authored rough cut). Builds one CutClip per Shot that has at least
   * one completed video/image generation Run, ordered by shotNumber, with
   * inPoint = 0 and outPoint = a duration estimate (run result.duration, else the
   * shot's durationEstimate, else DEFAULT_ASSEMBLED_CLIP_SECONDS). Transitions
   * default to empty (implicit 'cut'); BGM is left untouched.
   *
   * Clip ids are stable per source shot, so re-assembling preserves a shot's
   * clip id while replacing the full clip list. Writes via the Cut write path
   * (lazy story/cuts/, atomic, bumped updatedAt); honours expectedUpdatedAt (409).
   *
   * This is the seam the agent calls once media is generated; the user then
   * edits the resulting Cut on the timeline (trim/split/reorder/transition/bgm).
   */
  async assembleEpisodeCut(
    projectId: string,
    userId: string,
    episodeId: string,
    expectedUpdatedAt?: string,
  ): Promise<
    | { data: { updatedAt: string; clips: CutClip[] }; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    // Authorize + read the episode (the script is the source of truth for which
    // shots exist and their order). A missing episode is a 404.
    const safeEpisodeFile = `${episodeId}.json`
    if (!SAFE_EPISODE_PATTERN.test(safeEpisodeFile)) {
      logger.warn({ projectId, episodeId }, "story: invalid episode ID (assembleEpisodeCut)")
      return { error: { code: "VALIDATION_ERROR", message: "Invalid episode ID" }, status: 400 }
    }

    const dir = await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const epRead = await this.readJsonFile<StoryEpisode>(dir, `${STORY_EPISODES_DIR}/${safeEpisodeFile}`, projectId)
    if ("error" in epRead) return epRead
    const episode = epRead.data

    // Read the cut for its own optimistic-concurrency clock (lazily empty when
    // absent). 409 if expectedUpdatedAt is stale.
    const loaded = await this.loadCutForWrite(projectId, userId, episodeId, expectedUpdatedAt, "assembleEpisodeCut")
    if ("error" in loaded) return loaded
    const { relativePath, cut } = loaded

    // Read the runs to know which shots have completed visual media. Missing
    // runs file → no media yet → empty clip list.
    const runsFile = `${episodeId}.runs.json`
    const runsRead = await this.readJsonFile<StoryRuns>(dir, `${STORY_RUNS_DIR}/${runsFile}`, projectId)
    const runs: Record<string, unknown>[] =
      "error" in runsRead ? [] : Array.isArray(runsRead.data.runs) ? runsRead.data.runs : []

    // Per-shot PRIMARY run = the latest completed VIDEO run, else the latest
    // completed visual (image) run — mirrors bd-B's primary/playback semantics
    // (openimago-wa33) so the sourceDurationMs snapshot is taken from the run whose
    // media actually plays, not an unrelated run. Later runs in the append-only log
    // win within a kind; a video run always beats an image run for the same shot.
    const runByShot = new Map<string, { durationSeconds?: number; isVideo: boolean }>()
    for (const run of runs) {
      if (String(run["status"] ?? "") !== "completed") continue
      const result = (run["result"] ?? {}) as Record<string, unknown>
      const kind = String(result["kind"] ?? "")
      if (!VISUAL_RUN_KINDS.has(kind)) continue
      const shotId = String(run["shotId"] ?? "")
      if (!shotId) continue
      const isVideo = kind === "video"
      // Do not let a later image run displace an already-chosen video run.
      const existing = runByShot.get(shotId)
      if (existing?.isVideo && !isVideo) continue
      const duration = typeof result["duration"] === "number" ? result["duration"] : undefined
      runByShot.set(shotId, { durationSeconds: duration, isVideo })
    }

    // One clip per shot with completed media, in shotNumber order.
    const shots = Array.isArray(episode.shots) ? episode.shots : []
    const ordered = [...shots].sort((a, b) => {
      const an = typeof a["shotNumber"] === "number" ? a["shotNumber"] : 0
      const bn = typeof b["shotNumber"] === "number" ? b["shotNumber"] : 0
      return an - bn
    })

    const clips: CutClip[] = []
    for (const shot of ordered) {
      const shotId = String(shot["id"] ?? "")
      if (!shotId) continue
      const media = runByShot.get(shotId)
      if (!media) continue

      // Duration sources are SECONDS (run result.duration, shot durationEstimate);
      // convert to integer ms at this ingest boundary (cut schema v2). Rounding
      // keeps outPointMs whole even for fractional-second source durations.
      const shotEstimateSeconds =
        typeof shot["durationEstimate"] === "number" && shot["durationEstimate"] > 0
          ? (shot["durationEstimate"] as number)
          : undefined
      // sourceDurationMs (openimago-lknv): the persisted snapshot of the primary
      // run's REAL media length — set ONLY from an actual run duration (not the
      // estimate/default fallbacks, which are guesses, not the true source length).
      // Absent → omitted, so clamping later simply does not enforce an upper bound.
      const sourceDurationMs =
        media.durationSeconds && media.durationSeconds > 0
          ? Math.round(media.durationSeconds * MS_PER_S)
          : undefined
      const outPointMs =
        sourceDurationMs !== undefined
          ? sourceDurationMs
          : shotEstimateSeconds !== undefined
            ? Math.round(shotEstimateSeconds * MS_PER_S)
            : DEFAULT_ASSEMBLED_CLIP_MS

      clips.push({
        id: `clip-${shotId}`,
        sourceShotId: shotId,
        inPointMs: 0,
        outPointMs,
        order: clips.length,
        ...(sourceDurationMs !== undefined ? { sourceDurationMs } : {}),
      })
    }

    // Replace the clip list; preserve any existing bgm. Transitions reset to
    // empty (the assembler emits implicit 'cut' transitions only).
    const next: Omit<EpisodeCut, "updatedAt"> = {
      schemaVersion: CUT_SCHEMA_VERSION,
      episodeId,
      clips,
      transitions: [],
      ...(cut.bgm !== undefined ? { bgm: cut.bgm } : {}),
    }
    const result = await this.writeCut(dir, relativePath, next, projectId)
    if ("error" in result) return result
    return { data: { updatedAt: result.updatedAt, clips }, status: 200 }
  }
}

export const storyService = new StoryService()
