import { eq, and, desc } from "drizzle-orm"
import { db } from "../db/client"
import { workspaceGeneratedFiles, projects } from "../db/schema"
import { SessionTable } from "../db/session-schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { workspaceFileId as generateWorkspaceFileId } from "../utils/ids"
import { logger } from "../server/logger"
import { filmstripService, type FilmstripMeta } from "../media/filmstrip"
import { tmpdir } from "node:os"
import { join as pathJoin } from "node:path"
import { writeFile as fsWriteFile, rm as fsRm } from "node:fs/promises"

export const VALID_MEDIA_KINDS = ["image", "video", "audio"] as const
export type MediaKind = (typeof VALID_MEDIA_KINDS)[number]

// ── Generation-run metadata (ADR 0003 artifact-first rerun) ─────────────────
//
// Carried inside the workspaceGeneratedFiles.metadata JSONB column under
// the key "genRun". No DB migration needed — the metadata column already
// exists and accepts arbitrary JSON. Promote to dedicated columns only if
// query patterns demand it.

export interface GenerationRunMetadata {
  /** Tool name that generated this artifact (e.g. "image_generate"). */
  toolName: string
  /** OpenCode tool-call ID for traceability back to the chat message. */
  toolCallId: string
  /** Chat message ID containing the tool call. */
  messageId: string
  /** Full input arguments to the tool call (provider params, prompt, etc.).
   *  Exposed to the WorkspaceArtifactsPanel parameter editor for rerun. */
  inputArgs: Record<string, unknown>
  /** Parent artifact ID when this was created from a rerun/edit of another
   *  artifact. Immutably links rerun output to source artifact. */
  parentArtifactId?: string
}

const METADATA_GEN_RUN_KEY = "genRun"

export interface RegisterWorkspaceFileInput {
  sessionId: string
  kind: MediaKind
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  accessPreviewHref: string
  accessDownloadHref?: string
  accessThumbnailHref?: string
  accessPosterHref?: string
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
  // ── Generation-run metadata (ADR 0003, openimago-xkn) ──────────────
  /** Tool name that generated this artifact. */
  toolName?: string
  /** OpenCode tool-call ID. */
  toolCallId?: string
  /** Chat message ID containing the tool call. */
  messageId?: string
  /** Parent artifact ID for rerun lineage. */
  parentArtifactId?: string
  /** Full tool-call input arguments. */
  inputArgs?: Record<string, unknown>
}

export interface MediaAccessLocator {
  href: string
  expiresAt?: string
}

export interface WorkspaceFileAccessLocators {
  preview: MediaAccessLocator
  download?: MediaAccessLocator
  thumbnail?: MediaAccessLocator
  poster?: MediaAccessLocator
  /**
   * Precomputed timeline filmstrip SPRITE (openimago-k6bl): a horizontal strip of
   * 9:16 frames the NLE renders statically. Set ASYNC after registration by the
   * background filmstrip task (video only); the frame dims live in
   * metadata.filmstrip { frameCount, frameW, frameH }. Absent until the sprite is
   * generated (or when ffmpeg is unavailable — graceful skip).
   */
  filmstrip?: MediaAccessLocator
}

export interface WorkspaceFileRecord {
  workspaceFileId: string
  kind: string
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  access: WorkspaceFileAccessLocators
  prompt?: string
  provider?: string
  model?: string
  createdAt: string
  metadata?: Record<string, unknown>
  /** Surface generation-run metadata from the metadata JSONB column.
   *  Populated when genRun data was persisted at registration time. */
  generationRun?: GenerationRunMetadata
}

function buildAccessLocators(input: RegisterWorkspaceFileInput): WorkspaceFileAccessLocators {
  const locators: WorkspaceFileAccessLocators = {
    preview: { href: input.accessPreviewHref },
  }
  if (input.accessDownloadHref) {
    locators.download = { href: input.accessDownloadHref }
  }
  if (input.accessThumbnailHref) {
    locators.thumbnail = { href: input.accessThumbnailHref }
  }
  if (input.accessPosterHref) {
    locators.poster = { href: input.accessPosterHref }
  }
  return locators
}

/**
 * Merge generation-run fields into a metadata object for JSONB storage.
 * Existing metadata keys are preserved; gen-run data goes under "genRun".
 * Returns null when there is no gen-run data and no existing metadata.
 */
function buildMetadata(input: RegisterWorkspaceFileInput): Record<string, unknown> | null {
  const hasGenRun = input.toolName || input.toolCallId || input.messageId || input.parentArtifactId || input.inputArgs
  const genRunObj: Record<string, unknown> = {}
  if (input.toolName) genRunObj.toolName = input.toolName
  if (input.toolCallId) genRunObj.toolCallId = input.toolCallId
  if (input.messageId) genRunObj.messageId = input.messageId
  if (input.parentArtifactId) genRunObj.parentArtifactId = input.parentArtifactId
  if (input.inputArgs) genRunObj.inputArgs = input.inputArgs

  const hasExistingMeta = input.metadata && Object.keys(input.metadata).length > 0

  if (!hasGenRun && !hasExistingMeta) return null
  if (!hasGenRun) return input.metadata ?? null

  // Merge gen-run into existing metadata (existing keys preserved)
  return { ...(input.metadata ?? {}), [METADATA_GEN_RUN_KEY]: genRunObj }
}

function extractGenerationRun(meta: Record<string, unknown> | undefined): GenerationRunMetadata | undefined {
  if (!meta) return undefined
  const genRun = meta[METADATA_GEN_RUN_KEY]
  if (typeof genRun !== "object" || genRun === null) return undefined
  const g = genRun as Record<string, unknown>
  if (typeof g.toolName !== "string" || typeof g.toolCallId !== "string" || typeof g.messageId !== "string") {
    return undefined
  }
  if (typeof g.inputArgs !== "object" || g.inputArgs === null) return undefined

  return {
    toolName: g.toolName as string,
    toolCallId: g.toolCallId as string,
    messageId: g.messageId as string,
    inputArgs: g.inputArgs as Record<string, unknown>,
    ...(typeof g.parentArtifactId === "string" ? { parentArtifactId: g.parentArtifactId } : {}),
  }
}

function rowToRecord(row: typeof workspaceGeneratedFiles.$inferSelect): WorkspaceFileRecord {
  const access = row.accessLocators as WorkspaceFileAccessLocators
  const meta = row.metadata as Record<string, unknown> | undefined
  return {
    workspaceFileId: row.id,
    kind: row.kind,
    mime: row.mimeType,
    filename: row.filename ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    duration: row.duration ?? undefined,
    seed: (meta?.seed as number) ?? undefined,
    access,
    prompt: row.prompt ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.createdAt.toISOString(),
    metadata: meta,
    generationRun: extractGenerationRun(meta),
  }
}

export class WorkspaceFilesService {
  async registerFile(
    input: RegisterWorkspaceFileInput,
    userId: string,
    workspaceId: string | null,
  ): Promise<
    | { result: WorkspaceFileRecord; workspaceFileId: string; status: 201 }
    | { error: { code: string; message: string }; status: 400 | 404 | 403 }
  > {
    // Validate kind
    if (!VALID_MEDIA_KINDS.includes(input.kind)) {
      return {
        error: { code: "INVALID_KIND", message: `kind must be one of: ${VALID_MEDIA_KINDS.join(", ")}` },
        status: 400,
      }
    }

    // Validate required access preview href
    if (!input.accessPreviewHref) {
      return {
        error: { code: "MISSING_PREVIEW", message: "accessPreviewHref is required" },
        status: 400,
      }
    }

    // Verify session exists and belongs to workspace
    const rows = await db
      .select({
        workspaceId: SessionTable.workspace_id,
        directory: SessionTable.directory,
      })
      .from(SessionTable)
      .where(eq(SessionTable.id, input.sessionId))
      .limit(1)

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Session not found" }, status: 404 }
    }

    const session = rows[0]!

    if (workspaceId && session.workspaceId !== workspaceId) {
      return { error: { code: "FORBIDDEN", message: "Session does not belong to your workspace" }, status: 403 }
    }

    const id = generateWorkspaceFileId()
    const accessLocators = buildAccessLocators(input)
    const mergedMetadata = buildMetadata(input)
    const now = new Date()

    await db.insert(workspaceGeneratedFiles).values({
      id,
      sessionId: input.sessionId,
      workspaceId: session.workspaceId ?? "",
      kind: input.kind,
      mimeType: input.mime,
      filename: input.filename,
      width: input.width,
      height: input.height,
      duration: input.duration,
      accessLocators,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      metadata: mergedMetadata,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    // openimago-k6bl: for a VIDEO, kick off filmstrip-sprite generation in the
    // BACKGROUND (do NOT block the registration response). It downloads the
    // preview, runs ffmpeg, writes the sprite via the storage adapter, and PATCHes
    // this row's access_locators.filmstrip (+ metadata.filmstrip dims). Any
    // failure / missing ffmpeg is swallowed (warn) so registration is unaffected;
    // a later viewer just sees the sprite appear once ready.
    if (input.kind === "video" && session.directory) {
      void this.#generateFilmstripInBackground({
        workspaceFileId: id,
        previewHref: input.accessPreviewHref,
        outputDir: session.directory,
        existingMetadata: mergedMetadata,
        accessLocators,
      })
    }

    const result: WorkspaceFileRecord = {
      workspaceFileId: id,
      kind: input.kind,
      mime: input.mime,
      filename: input.filename,
      width: input.width,
      height: input.height,
      duration: input.duration,
      seed: input.seed,
      access: accessLocators,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      createdAt: now.toISOString(),
      metadata: mergedMetadata ?? undefined,
      generationRun: extractGenerationRun(mergedMetadata ?? undefined),
    }

    logger.info({ workspaceFileId: id, sessionId: input.sessionId, kind: input.kind }, "workspace-files: registered")

    return { workspaceFileId: id, result, status: 201 }
  }

  /**
   * Background filmstrip-sprite generation for a registered VIDEO (openimago-k6bl).
   * Downloads the preview to a temp file (http/https only — relative/mock URLs have
   * no fetchable host, so they skip), runs FilmstripService.generate (system
   * ffmpeg → storage adapter), then PATCHes the row's access_locators.filmstrip +
   * metadata.filmstrip dims. Never throws — all failures are logged and swallowed
   * so the (already-returned) registration is unaffected.
   */
  async #generateFilmstripInBackground(args: {
    workspaceFileId: string
    previewHref: string
    outputDir: string
    existingMetadata: Record<string, unknown> | null
    accessLocators: WorkspaceFileAccessLocators
  }): Promise<void> {
    const { workspaceFileId, previewHref, outputDir } = args
    let tmpVideo: string | null = null
    try {
      // Only http(s) previews are fetchable to a local file for ffmpeg. Relative
      // (/mock/*) or data URLs have no real video to sample → skip quietly.
      if (!/^https?:\/\//i.test(previewHref)) {
        logger.info({ workspaceFileId }, "filmstrip: non-fetchable preview href — skipping sprite")
        return
      }
      const res = await fetch(previewHref)
      if (!res.ok) {
        logger.warn({ workspaceFileId, status: res.status }, "filmstrip: preview download failed — skipping")
        return
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      tmpVideo = pathJoin(tmpdir(), `filmstrip_src_${workspaceFileId}_${Date.now()}.mp4`)
      await fsWriteFile(tmpVideo, bytes)

      const generated = await filmstripService.generate({
        artifactId: workspaceFileId,
        videoPath: tmpVideo,
        outputDir,
        referenceUrl: previewHref,
      })
      if (!generated) return // ffmpeg unavailable/failed — already warned, skip.

      await this.#patchFilmstrip(workspaceFileId, args.accessLocators, args.existingMetadata, generated.url, generated.filmstrip)
      logger.info({ workspaceFileId, filmstrip: generated.url }, "filmstrip: sprite ready")
    } catch (err) {
      logger.warn({ workspaceFileId, err }, "filmstrip: background generation error — skipping")
    } finally {
      if (tmpVideo) await fsRm(tmpVideo, { force: true }).catch(() => {})
    }
  }

  /** PATCH a row's access_locators.filmstrip + metadata.filmstrip dims (JSONB; no migration). */
  async #patchFilmstrip(
    workspaceFileId: string,
    accessLocators: WorkspaceFileAccessLocators,
    existingMetadata: Record<string, unknown> | null,
    filmstripUrl: string,
    dims: FilmstripMeta,
  ): Promise<void> {
    const nextAccess: WorkspaceFileAccessLocators = { ...accessLocators, filmstrip: { href: filmstripUrl } }
    const nextMetadata: Record<string, unknown> = { ...(existingMetadata ?? {}), filmstrip: dims }
    await db
      .update(workspaceGeneratedFiles)
      .set({ accessLocators: nextAccess, metadata: nextMetadata, updatedAt: new Date() })
      .where(eq(workspaceGeneratedFiles.id, workspaceFileId))
  }

  async listFiles(
    sessionId: string,
    userId: string,
    workspaceId: string | null,
    _filter?: { source?: string },
  ): Promise<
    | { workspaceFiles: WorkspaceFileRecord[]; status: 200 }
    | { error: { code: string; message: string }; status: 404 | 403 }
  > {
    // Verify session exists and belongs to workspace
    const rows = await db
      .select({
        workspaceId: SessionTable.workspace_id,
      })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionId))
      .limit(1)

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Session not found" }, status: 404 }
    }

    const session = rows[0]!

    if (workspaceId && session.workspaceId !== workspaceId) {
      return { error: { code: "FORBIDDEN", message: "Session does not belong to your workspace" }, status: 403 }
    }

    const conditions = [
      eq(workspaceGeneratedFiles.sessionId, sessionId),
      eq(workspaceGeneratedFiles.status, "active"),
    ]

    const files = await db
      .select()
      .from(workspaceGeneratedFiles)
      .where(and(...conditions))
      .orderBy(desc(workspaceGeneratedFiles.createdAt))

    const records = files.map(rowToRecord)

    return { workspaceFiles: records, status: 200 }
  }

  /**
   * Aggregate all tool-generated workspace files for a project.
   *
   * Project identity is resolved via the workspace→project link
   * (`workspace.project_id`), NOT via session.directory: verified against the
   * live DB, session directories are workspace-scoped (`/opt/work/wrk_*`) while
   * project directories are project-scoped (`/opt/work/proj_*`), so a
   * `session.directory = project.directory` join returns nothing. Sessions also
   * carry `project_id = "global"`, so that column is unusable for filtering.
   *
   * Join: workspace_generated_files → workspace ON workspace_id
   *       WHERE workspace.project_id = projectId AND status = 'active'.
   */
  async listProjectFiles(
    projectId: string,
    userId: string,
  ): Promise<
    | { workspaceFiles: WorkspaceFileRecord[]; status: 200 }
    | { error: { code: string; message: string }; status: 404 | 403 }
  > {
    // Verify project exists and is owned by the requesting user
    const projectRows = await db
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (projectRows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }

    if (projectRows[0]!.userId !== userId) {
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }

    const files = await db
      .select({ file: workspaceGeneratedFiles })
      .from(workspaceGeneratedFiles)
      .innerJoin(
        WorkspaceTable,
        eq(WorkspaceTable.id, workspaceGeneratedFiles.workspaceId),
      )
      .where(
        and(
          eq(WorkspaceTable.project_id, projectId),
          eq(workspaceGeneratedFiles.status, "active"),
        ),
      )
      .orderBy(desc(workspaceGeneratedFiles.createdAt))

    const records = files.map((row) => rowToRecord(row.file))

    return { workspaceFiles: records, status: 200 }
  }
}

export const workspaceFilesService = new WorkspaceFilesService()
