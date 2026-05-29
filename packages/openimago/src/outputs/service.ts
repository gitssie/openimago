import { eq } from "drizzle-orm"
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs"
import { join, extname } from "path"
import { db } from "../db/client"
import { projects } from "../db/schema"
import { SessionTable } from "../db/session-schema"

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"])
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".webm", ".mkv"])

function extToMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".json": "application/json",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ts": "application/typescript",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  }
  return map[ext.toLowerCase()] ?? "application/octet-stream"
}

export interface OutputEntry {
  name: string
  path: string
  size: number
  mimeType: string
  thumbnailPath?: string
  modifiedAt: string
}

export class OutputsService {
  async listOutputs(
    sessionId: string,
    userId: string,
    workspaceId: string | null,
    filter?: { type?: string; order?: string },
  ): Promise<
    | { outputs: OutputEntry[]; status: 200 }
    | { error: { code: string; message: string }; status: 404 }
  > {
    const rows = await db
      .select()
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Session not found" }, status: 404 }
    }

    const session = rows[0]!
    if (workspaceId && session.workspace_id !== workspaceId) {
      return { error: { code: "NOT_FOUND", message: "Session not found" }, status: 404 }
    }

    return this.scanDirectory(session.directory, filter)
  }

  async listProjectOutputs(
    projectId: string,
    userId: string,
    filter?: { type?: string; order?: string },
  ): Promise<
    | { outputs: OutputEntry[]; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }

    const project = rows[0]!
    if (project.userId !== userId) {
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }

    return this.scanDirectory(project.directory, filter)
  }

  private scanDirectory(
    directory: string,
    filter?: { type?: string; order?: string },
  ): { outputs: OutputEntry[]; status: 200 } | { error: { code: string; message: string }; status: 404 } {
    let files: string[]
    try {
      files = readdirSync(directory)
    } catch {
      return { error: { code: "NOT_FOUND", message: "Directory not accessible" }, status: 404 }
    }

    files = files.filter((f) => f !== ".thumbnails" && !f.startsWith("."))

    if (filter?.type) {
      files = files.filter((f) => {
        const ext = extname(f).toLowerCase()
        if (filter.type === "image") return IMAGE_EXTS.has(ext)
        if (filter.type === "video") return VIDEO_EXTS.has(ext)
        if (filter.type === "other") return !IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)
        return true
      })
    }

    const outputs: OutputEntry[] = files.map((name) => {
      const fullPath = join(directory, name)
      const stat = statSync(fullPath)
      const ext = extname(name).toLowerCase()
      const mimeType = extToMimeType(ext)

      let thumbnailPath: string | undefined
      if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) {
        thumbnailPath = this.ensureThumbnail(directory, name)
      }

      return {
        name,
        path: name,
        size: stat.size,
        mimeType,
        thumbnailPath,
        modifiedAt: stat.mtime.toISOString(),
      }
    })

    const order = filter?.order ?? "desc"
    outputs.sort((a, b) => {
      const cmp = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
      return order === "asc" ? cmp : -cmp
    })

    return { outputs, status: 200 }
  }

  private ensureThumbnail(directory: string, filename: string): string | undefined {
    const thumbDir = join(directory, ".thumbnails")
    mkdirSync(thumbDir, { recursive: true })

    const thumbFile = join(thumbDir, `${filename}.thumb.webp`)
    if (existsSync(thumbFile)) {
      return `.thumbnails/${filename}.thumb.webp`
    }

    // Attempt to generate thumbnail — if it fails, return undefined
    try {
      // For now, generate a minimal placeholder (1x1 webp)
      // Real thumbnail generation would use sharp or similar
      const sourcePath = join(directory, filename)
      const buffer = readFileSync(sourcePath)
      // Simple: write a tiny placeholder - in production this would be actual image processing
      writeFileSync(thumbFile, buffer.slice(0, Math.min(buffer.length, 1024)))
      return `.thumbnails/${filename}.thumb.webp`
    } catch {
      return undefined
    }
  }
}

export const outputsService = new OutputsService()
