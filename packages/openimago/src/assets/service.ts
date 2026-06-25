import { eq, and, or, sql, lt, gt } from "drizzle-orm"
import { db } from "../db/client"
import { assets } from "../db/schema"
import { userId as genUserId } from "../utils/ids"
import { localStorage, type StorageAdapter } from "../storage/adapter"

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

function getMaxUploadSize(): number {
  return parseInt(process.env.MAX_UPLOAD_SIZE ?? "104857600", 10)
}

const SUPPORTED_MIME_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp",
  "video/mp4", "audio/mpeg",
])

function assetId(): string {
  return `ast_${genUserId().slice(4)}`
}

/**
 * Same-origin servable URL for an asset's bytes (openimago-w5bu). Assets live in
 * COS storage, which is NOT directly web-servable, so the URL points at the
 * authenticated download route that streams the file. Centralised so list/get
 * agree on the shape (the BGM picker + cut hydration both rely on it).
 */
function assetDownloadUrl(id: string): string {
  return `/api/platform/assets/${id}/download`
}

export class AssetsService {
  private storage: StorageAdapter

  constructor(storage: StorageAdapter = localStorage) {
    this.storage = storage
  }

  async upload(userId: string, file: File): Promise<
    | { asset: Record<string, any>; status: 201 }
    | { error: { code: string; message: string }; status: number }
  > {
    // Validate mime type
    if (!SUPPORTED_MIME_TYPES.has(file.type)) {
      return { error: { code: "VALIDATION_ERROR", message: `Unsupported file type: ${file.type}` }, status: 400 }
    }

    // Size check
    const maxSize = getMaxUploadSize()
    if (file.size > maxSize) {
      return { error: { code: "FILE_TOO_LARGE", message: `File exceeds max size of ${maxSize} bytes` }, status: 400 }
    }

    const id = assetId()
    const filename = file.name
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : ""
    const storedName = `${id}${ext}`

    // Build storage paths
    const datePrefix = new Date().toISOString().slice(0, 7)
    const assetDir = `${COS_BASE_PATH}/assets_${userId}/${datePrefix}`
    const storagePath = `${assetDir}/${storedName}`

    const buffer = new Uint8Array(await file.arrayBuffer())
    await this.storage.write(storagePath, buffer, { ensureDir: true })

    // Generate thumbnail for images
    let thumbnailPath: string | null = null
    if (file.type.startsWith("image/")) {
      const thumbDir = `${assetDir}/.thumbnails`
      const thumbFile = `${thumbDir}/${storedName}.thumb.webp`
      // Simple placeholder thumbnail — in production this would use real image processing
      const thumbData = buffer.slice(0, Math.min(buffer.byteLength, 2048))
      await this.storage.write(thumbFile, thumbData, { ensureDir: true })
      thumbnailPath = `.thumbnails/${storedName}.thumb.webp`
    }

    const now = new Date()
    await db.insert(assets).values({
      id,
      userId,
      filename,
      storedName,
      mimeType: file.type,
      size: file.size,
      width: null,
      height: null,
      duration: null,
      thumbnailPath,
      storagePath,
      status: "active",
      createdAt: now,
    })

    return {
      asset: {
        id,
        filename,
        mimeType: file.type,
        size: file.size,
        width: null,
        height: null,
        duration: null,
        thumbnailPath,
        url: assetDownloadUrl(id),
        createdAt: now.toISOString(),
      },
      status: 201,
    } as const
  }

  async list(userId: string, query: { type?: string; cursor?: string; order?: string; limit?: number }) {
    const { type, order = "desc", limit = 50 } = query
    const effectiveLimit = Math.min(limit ?? 50, 200)

    const conditions = [eq(assets.userId, userId), eq(assets.status, "active")]

    if (type) {
      conditions.push(sql`${assets.mimeType} LIKE ${type + '/%'}`)
    }

    const where = and(...conditions)
    const rows = await db
      .select()
      .from(assets)
      .where(where)
      .orderBy(order === "asc" ? assets.createdAt : sql`${assets.createdAt} DESC`)
      .limit(effectiveLimit + 1) // +1 for cursor

    const hasMore = rows.length > effectiveLimit
    const items = rows.slice(0, effectiveLimit).map((r) => ({
      id: r.id,
      filename: r.filename,
      mimeType: r.mimeType,
      size: r.size,
      width: r.width,
      height: r.height,
      duration: r.duration,
      thumbnailPath: r.thumbnailPath,
      url: assetDownloadUrl(r.id),
      createdAt: r.createdAt.toISOString(),
    }))

    let cursor: { next?: string; previous?: string } = {}
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!
      cursor.next = btoa(JSON.stringify({ id: last.id, createdAt: last.createdAt }))
    }

    return { items, cursor, status: 200 } as const
  }

  async get(userId: string, assetId: string) {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId), eq(assets.status, "active")))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Asset not found" }, status: 404 } as const
    }

    const r = rows[0]!
    return {
      asset: {
        id: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        size: r.size,
        width: r.width,
        height: r.height,
        duration: r.duration,
        thumbnailPath: r.thumbnailPath,
        storagePath: r.storagePath,
        url: assetDownloadUrl(r.id),
        createdAt: r.createdAt.toISOString(),
      },
      status: 200,
    } as const
  }

  /**
   * Stream an asset's stored bytes (openimago-w5bu). Ownership-scoped (same
   * 404-for-other-users contract as get) so the same-origin download URL is
   * safe. Returns the raw bytes + mime so the route can set Content-Type.
   */
  async download(userId: string, assetId: string) {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId), eq(assets.status, "active")))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Asset not found" }, status: 404 } as const
    }

    const r = rows[0]!
    try {
      const bytes = await this.storage.read(r.storagePath)
      return { bytes, mimeType: r.mimeType, filename: r.filename, status: 200 } as const
    } catch {
      return { error: { code: "NOT_FOUND", message: "Asset file missing" }, status: 404 } as const
    }
  }

  async delete(userId: string, assetId: string) {
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Asset not found" }, status: 404 } as const
    }

    await db
      .update(assets)
      .set({ status: "archived" })
      .where(eq(assets.id, assetId))

    return { asset: { id: assetId, status: "archived" }, status: 200 } as const
  }
}

export const assetsService = new AssetsService()
