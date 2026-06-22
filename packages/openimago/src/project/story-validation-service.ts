import { and, eq } from "drizzle-orm"
import { access, readFile } from "fs/promises"
import path from "path"
import { db } from "../db/client"
import { projects, workspaceGeneratedFiles } from "../db/schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { logger } from "../server/logger"
import {
  validateStoryGraph,
  type NamedDoc,
  type StampedArtifact,
  type StoryValidationInput,
  type StoryValidationReport,
} from "./story-validation"

// ── Canonical story file layout (mirrors StoryService) ────────────────────────

const CANONICAL_BIBLE = "story/bible.json"
const CANONICAL_SERIES = "story/series.json"
const STORY_EPISODES_DIR = "story/episodes"
const STORY_WORKFLOW_DIR = "story/workflow"
const STORY_RUNS_DIR = "story/runs"

const SAFE_EPISODE_ID_PATTERN = /^ep_[a-z0-9_]+$/

/**
 * Reads the 5-layer story state from the project directory, resolves the set of
 * real artifacts from the database, and runs the pure graph validator
 * (story-validation.ts). Authorization mirrors StoryService: project must exist
 * and be owned by the requesting user.
 */
export class StoryValidationService {
  /** Validate project ownership and return the project directory. */
  private async resolveProjectDir(
    projectId: string,
    userId: string,
  ): Promise<string | { error: { code: string; message: string }; status: number }> {
    const rows = await db.select().from(projects).where(eq(projects.id, projectId))
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }
    const project = rows[0]!
    if (project.userId !== userId) {
      logger.warn({ userId, projectId }, "story-validate: forbidden — not project owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }
    return project.directory
  }

  /**
   * Read + parse a JSON file inside the project dir, with a path-traversal
   * guard. Returns null when the file is absent (a missing optional story file
   * is not an error for the validator — the graph rules report what's missing).
   * A malformed file surfaces as a validator INVALID_JSON via the returned
   * sentinel { __parseError: true }.
   */
  private async readJson(projectDir: string, relativePath: string): Promise<unknown | null> {
    const resolved = path.resolve(path.join(projectDir, relativePath))
    const resolvedDir = path.resolve(projectDir)
    if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
      logger.warn({ relativePath }, "story-validate: path traversal blocked")
      return null
    }
    try {
      await access(resolved)
    } catch {
      return null
    }
    try {
      const raw = await readFile(resolved, "utf-8")
      return JSON.parse(raw) as unknown
    } catch (err) {
      logger.warn({ relativePath, err }, "story-validate: failed to read/parse story file")
      // Surface as a non-object so the validator emits INVALID_JSON for this file.
      return { __parseError: true }
    }
  }

  /**
   * Build the known-artifact set + stamped-artifact list for a project from
   * workspace_generated_files (joined to the workspace's project). The artifact
   * id used by run results is the workspaceGeneratedFiles.id; the shot/node
   * stamp (closed-loop, follow-up issue) lives in metadata.
   */
  private async loadArtifacts(
    projectId: string,
  ): Promise<{ knownArtifactIds: Set<string>; stampedArtifacts: StampedArtifact[] }> {
    const rows = await db
      .select({ id: workspaceGeneratedFiles.id, metadata: workspaceGeneratedFiles.metadata })
      .from(workspaceGeneratedFiles)
      .innerJoin(WorkspaceTable, eq(WorkspaceTable.id, workspaceGeneratedFiles.workspaceId))
      .where(
        and(
          eq(WorkspaceTable.project_id, projectId),
          eq(workspaceGeneratedFiles.status, "active"),
        ),
      )

    const knownArtifactIds = new Set<string>()
    const stampedArtifacts: StampedArtifact[] = []
    for (const row of rows) {
      knownArtifactIds.add(row.id)
      const stamp = this.readStamp((row.metadata ?? {}) as Record<string, unknown>)
      if (stamp.shotId !== null || stamp.nodeId !== null) {
        stampedArtifacts.push({ artifactId: row.id, shotId: stamp.shotId, nodeId: stamp.nodeId })
      }
    }
    return { knownArtifactIds, stampedArtifacts }
  }

  /**
   * Extract the story-graph stamp (shotId/nodeId) from an artifact's metadata.
   * The generate-image tool passes provenance as inputArgs, which the
   * workspace-files service stores under metadata.genRun.inputArgs. Falls back
   * to a top-level metadata stamp for robustness.
   */
  private readStamp(meta: Record<string, unknown>): { shotId: string | null; nodeId: string | null } {
    const pick = (src: Record<string, unknown>, key: string): string | null =>
      typeof src[key] === "string" ? (src[key] as string) : null

    const genRun = meta["genRun"]
    if (typeof genRun === "object" && genRun !== null) {
      const inputArgs = (genRun as Record<string, unknown>)["inputArgs"]
      if (typeof inputArgs === "object" && inputArgs !== null) {
        const ia = inputArgs as Record<string, unknown>
        const shotId = pick(ia, "shotId")
        const nodeId = pick(ia, "nodeId")
        if (shotId !== null || nodeId !== null) return { shotId, nodeId }
      }
    }
    return { shotId: pick(meta, "shotId"), nodeId: pick(meta, "nodeId") }
  }

  /** Episode ids declared by series.json (used to enumerate episode files). */
  private seriesEpisodeIds(series: unknown): string[] {
    if (typeof series !== "object" || series === null) return []
    const episodes = (series as Record<string, unknown>)["episodes"]
    if (!Array.isArray(episodes)) return []
    const ids: string[] = []
    for (const entry of episodes) {
      if (typeof entry === "object" && entry !== null) {
        const id = (entry as Record<string, unknown>)["id"]
        if (typeof id === "string" && SAFE_EPISODE_ID_PATTERN.test(id)) ids.push(id)
      }
    }
    return ids
  }

  /** Resolve the project directory WITHOUT an owner check (service channel). */
  private async resolveProjectDirUnchecked(
    projectId: string,
  ): Promise<string | { error: { code: string; message: string }; status: number }> {
    const rows = await db
      .select({ directory: projects.directory })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }
    return rows[0]!.directory
  }

  /**
   * Validate the full story graph for a project. Reads bible/series, then every
   * episode declared by series.json plus its workflow/runs files, resolves real
   * artifacts from the DB, and runs the pure validator.
   *
   * `userId` enforces project ownership (JWT/browser channel). Pass `null` on
   * the trusted service channel (the opencode plugin via x-api-key), which skips
   * the ownership check — mirroring the workspace-files dual-channel auth.
   */
  async validate(
    projectId: string,
    userId: string | null,
  ): Promise<
    | { report: StoryValidationReport; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const dir =
      userId === null
        ? await this.resolveProjectDirUnchecked(projectId)
        : await this.resolveProjectDir(projectId, userId)
    if (typeof dir !== "string") return dir

    const bibleData = await this.readJson(dir, CANONICAL_BIBLE)
    const seriesData = await this.readJson(dir, CANONICAL_SERIES)

    const episodeIds = this.seriesEpisodeIds(seriesData)
    const episodes: NamedDoc[] = []
    const workflows: NamedDoc[] = []
    const runs: NamedDoc[] = []
    const presentEpisodeIds: string[] = []

    for (const epId of episodeIds) {
      const epFile = `${STORY_EPISODES_DIR}/${epId}.json`
      const epData = await this.readJson(dir, epFile)
      if (epData !== null) {
        presentEpisodeIds.push(epId)
        episodes.push({ file: epFile, data: epData })
      }
      const wfFile = `${STORY_WORKFLOW_DIR}/${epId}.workflow.json`
      const wfData = await this.readJson(dir, wfFile)
      if (wfData !== null) workflows.push({ file: wfFile, data: wfData })

      const runsFile = `${STORY_RUNS_DIR}/${epId}.runs.json`
      const runsData = await this.readJson(dir, runsFile)
      if (runsData !== null) runs.push({ file: runsFile, data: runsData })
    }

    const { knownArtifactIds, stampedArtifacts } = await this.loadArtifacts(projectId)

    const input: StoryValidationInput = {
      ...(bibleData !== null ? { bible: { file: CANONICAL_BIBLE, data: bibleData } } : {}),
      ...(seriesData !== null ? { series: { file: CANONICAL_SERIES, data: seriesData } } : {}),
      episodes,
      workflows,
      runs,
      presentEpisodeIds,
      knownArtifactIds,
      stampedArtifacts,
    }

    const report = validateStoryGraph(input)
    return { report, status: 200 }
  }
}

export const storyValidationService = new StoryValidationService()
