import { eq, and, desc } from "drizzle-orm"
import { db } from "../db/client"
import { workspaceGeneratedFiles } from "../db/schema"
import { SessionTable } from "../db/session-schema"
import { workspaceFileId as generateWorkspaceFileId } from "../utils/ids"
import { logger } from "../server/logger"

export const VALID_MEDIA_KINDS = ["image", "video", "audio"] as const
export type MediaKind = (typeof VALID_MEDIA_KINDS)[number]

export interface RegisterWorkspaceFileInput {
  sessionId: string
  kind: MediaKind
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  accessPreviewHref: string
  accessDownloadHref?: string
  accessThumbnailHref?: string
  accessPosterHref?: string
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
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
}

export interface WorkspaceFileRecord {
  workspaceFileId: string
  kind: string
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  access: WorkspaceFileAccessLocators
  prompt?: string
  provider?: string
  model?: string
  createdAt: string
  metadata?: Record<string, unknown>
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

function rowToRecord(row: typeof workspaceGeneratedFiles.$inferSelect): WorkspaceFileRecord {
  const access = row.accessLocators as WorkspaceFileAccessLocators
  return {
    workspaceFileId: row.id,
    kind: row.kind,
    mime: row.mimeType,
    filename: row.filename ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    duration: row.duration ?? undefined,
    access,
    prompt: row.prompt ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.createdAt.toISOString(),
    metadata: row.metadata as Record<string, unknown> | undefined,
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
      metadata: input.metadata ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    const result: WorkspaceFileRecord = {
      workspaceFileId: id,
      kind: input.kind,
      mime: input.mime,
      filename: input.filename,
      width: input.width,
      height: input.height,
      duration: input.duration,
      access: accessLocators,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      createdAt: now.toISOString(),
      metadata: input.metadata,
    }

    logger.info({ workspaceFileId: id, sessionId: input.sessionId, kind: input.kind }, "workspace-files: registered")

    return { workspaceFileId: id, result, status: 201 }
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
}

export const workspaceFilesService = new WorkspaceFilesService()
