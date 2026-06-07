import { join, basename } from "node:path"
import { db } from "../db/client"
import { tempAttachments } from "../db/schema"
import { and, eq } from "drizzle-orm"
import { logger } from "../server/logger"
import { localStorage, type StorageAdapter } from "../storage/adapter"

export interface AttachmentInput {
  id: string
  scope: "temporary" | "session" | "project"
  filename: string
  mime: string
}

export interface ResolvedFilePart {
  type: "file"
  mime: string
  filename: string
  url: string
}

export type ResolveResult = ResolvedFilePart | null

/**
 * AttachmentResolverStrategy — resolves an attachment input to an OpenCode FilePart.
 * Each scope handles ownership validation, file location, and path construction.
 */
export interface AttachmentResolverStrategy {
  readonly scope: string
  resolve(
    input: AttachmentInput,
    ctx: ResolverContext,
  ): Promise<ResolveResult>
}

export interface ResolverContext {
  userId: string
  sessionDirectory: string
  workspaceId: string
}

/** Safe filename: basename strips traversal, then prepend attachment ID for uniqueness */
function safeDestName(attachmentId: string, filename: string): string {
  let safe = basename(filename).replace(/\0/g, "")
  if (!safe || safe === "." || safe === "..") safe = `${attachmentId}.bin`
  return `${attachmentId}_${safe}`
}

// ── Temporary scope resolver ────────────────────────────────────────

class TemporaryResolver implements AttachmentResolverStrategy {
  readonly scope = "temporary"
  private storage: StorageAdapter

  constructor(storage: StorageAdapter = localStorage) {
    this.storage = storage
  }

  async resolve(input: AttachmentInput, ctx: ResolverContext): Promise<ResolveResult> {
    const [row] = await db
      .select({ storagePath: tempAttachments.storagePath, mimeType: tempAttachments.mimeType })
      .from(tempAttachments)
      .where(
        and(
          eq(tempAttachments.id, input.id),
          eq(tempAttachments.userId, ctx.userId),
          eq(tempAttachments.status, "pending"),
        ),
      )
      .limit(1)

    if (!row) {
      logger.warn({ userId: ctx.userId, attachmentId: input.id }, "attachments: temp not found or not owned")
      return null
    }

    const attachDir = join(ctx.sessionDirectory, "attachments")
    const destName = safeDestName(input.id, input.filename)
    let destPath = join(attachDir, destName)

    // Handle name conflicts (if same id+filename somehow already exists)
    if (await this.storage.exists(destPath)) {
      destPath = join(attachDir, `${input.id}_${Date.now()}_${destName}`)
    }

    await this.storage.copy({ sourcePath: row.storagePath, destPath, ensureDir: true })
    logger.info({ userId: ctx.userId, attachmentId: input.id, destPath }, "attachments: copied temp to session")

    return {
      type: "file",
      mime: row.mimeType,
      filename: basename(destPath),
      url: `file://${destPath}`,
    }
  }
}

// ── Session scope resolver (minimal — validates file exists) ────────

class SessionResolver implements AttachmentResolverStrategy {
  readonly scope = "session"
  private storage: StorageAdapter

  constructor(storage: StorageAdapter = localStorage) {
    this.storage = storage
  }

  async resolve(input: AttachmentInput, ctx: ResolverContext): Promise<ResolveResult> {
    const attachDir = join(ctx.sessionDirectory, "attachments")
    const destName = safeDestName(input.id, input.filename)
    const filePath = join(attachDir, destName)

    if (!(await this.storage.exists(filePath))) {
      logger.warn({ userId: ctx.userId, attachmentId: input.id, filePath }, "attachments: session file not found")
      return null
    }

    return {
      type: "file",
      mime: input.mime,
      filename: basename(filePath),
      url: `file://${filePath}`,
    }
  }
}

// ── Project scope resolver (minimal stub) ───────────────────────────

class ProjectResolver implements AttachmentResolverStrategy {
  readonly scope = "project"

  async resolve(_input: AttachmentInput, _ctx: ResolverContext): Promise<ResolveResult> {
    // Project-scoped attachments not yet implemented; return null to skip
    logger.warn("attachments: project scope not yet implemented")
    return null
  }
}

// ── Registry ────────────────────────────────────────────────────────

const resolvers: Record<string, AttachmentResolverStrategy> = {
  temporary: new TemporaryResolver(),
  session: new SessionResolver(),
  project: new ProjectResolver(),
}

export function getAttachmentResolver(scope: string): AttachmentResolverStrategy | undefined {
  return resolvers[scope]
}

export async function resolveAttachments(
  inputs: AttachmentInput[],
  ctx: ResolverContext,
): Promise<ResolvedFilePart[]> {
  const parts: ResolvedFilePart[] = []

  for (const input of inputs) {
    const resolver = getAttachmentResolver(input.scope)
    if (!resolver) {
      logger.warn({ scope: input.scope }, "attachments: unknown scope, skipping")
      continue
    }
    const part = await resolver.resolve(input, ctx)
    if (part) parts.push(part)
  }

  return parts
}
