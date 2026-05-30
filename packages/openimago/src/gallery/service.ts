import { eq, and, asc, desc, sql, lt, gt } from "drizzle-orm"
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "fs"
import { join, extname, basename } from "path"
import { db } from "../db/client"
import { galleryWorks } from "../db/schema"
import { galleryWorkId } from "../utils/ids"
import { logger } from "../server/logger"

// ═══════════════════════════════════════════════════════════════════════════
// COS_BASE_PATH is required — no hidden default
// ═══════════════════════════════════════════════════════════════════════════

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export const GALLERY_CATEGORIES = [
  "poster", "product", "character", "scene", "brand", "storyboard",
] as const

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number]

export interface GalleryListQuery {
  category?: string
  cursor?: string
  limit?: number
}

export interface GalleryCardItem {
  slug: string
  title: string
  category: string
  thumbnailUrl: string | null
  tags: string[] | null
}

export interface GalleryDetailItem {
  slug: string
  title: string
  category: string
  tags: string[] | null
  prompt: string
  imageUrl: string | null
  navigation: {
    prevSlug: string | null
    nextSlug: string | null
  }
}

export interface ManifestWorkEntry {
  slug: string
  title: string
  category: string
  tags?: string[]
  prompt: string
  imageFile: string
  sortOrder?: number
  publishedAt?: string
}

export interface Manifest {
  works: ManifestWorkEntry[]
}

export interface ImportResult {
  total: number
  created: number
  updated: number
  failed: number
  errors: Array<{ slug: string; error: string }>
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface CursorData {
  sortOrder: number
  publishedAt: string
  slug: string
}

function encodeCursor(item: { sortOrder: number; publishedAt: string; slug: string }): string {
  return btoa(JSON.stringify({
    sortOrder: item.sortOrder,
    publishedAt: item.publishedAt,
    slug: item.slug,
  } satisfies CursorData))
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const data = JSON.parse(atob(cursor)) as CursorData
    if (typeof data.sortOrder !== "number" || typeof data.publishedAt !== "string" || typeof data.slug !== "string") {
      return null
    }
    return data
  } catch {
    return null
  }
}

function isValidCategory(cat: string): cat is GalleryCategory {
  return (GALLERY_CATEGORIES as readonly string[]).includes(cat)
}

function getMimeFromExt(ext: string): string | null {
  const mimeMap: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  }
  return mimeMap[ext.toLowerCase()] ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Service
// ═══════════════════════════════════════════════════════════════════════════

export class GalleryService {
  /**
   * List gallery works with cursor-based pagination.
   * Sorted by sort_order ASC, published_at DESC.
   * When category is non-empty, filters by that category.
   */
  async list(query: GalleryListQuery): Promise<
    | { items: GalleryCardItem[]; nextCursor: string | null; hasMore: boolean; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    const { limit = 20 } = query
    const effectiveLimit = Math.min(Math.max(limit ?? 20, 1), 50)

    const conditions = [eq(galleryWorks.status, "active")]

    if (query.category && query.category !== "all") {
      if (!isValidCategory(query.category)) {
        return { error: { code: "VALIDATION_ERROR", message: `Invalid category: ${query.category}` }, status: 400 }
      }
      conditions.push(eq(galleryWorks.category, query.category))
    }

    const where = and(...conditions)

    // Build cursor condition: (sort_order, published_at DESC, slug) composite key
    let cursorCondition: ReturnType<typeof sql> | null = null
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor)
      if (!cursor) {
        return { error: { code: "VALIDATION_ERROR", message: "Invalid cursor" }, status: 400 }
      }
      // For composite ordering (sort_order ASC, published_at DESC, slug):
      // - same sort_order AND published_at same AND slug > cursor.slug
      // - same sort_order AND published_at < cursor.published_at
      // - sort_order > cursor.sort_order
      cursorCondition = sql`
        (
          ${galleryWorks.sortOrder} > ${cursor.sortOrder}
        ) OR (
          ${galleryWorks.sortOrder} = ${cursor.sortOrder} AND ${galleryWorks.publishedAt} < ${cursor.publishedAt}::timestamptz
        ) OR (
          ${galleryWorks.sortOrder} = ${cursor.sortOrder} AND ${galleryWorks.publishedAt} = ${cursor.publishedAt}::timestamptz AND ${galleryWorks.slug} > ${cursor.slug}
        )
      `
    }

    const queryBuilder = db
      .select({
        slug: galleryWorks.slug,
        title: galleryWorks.title,
        category: galleryWorks.category,
        tags: galleryWorks.tags,
        thumbnailUrl: galleryWorks.thumbnailUrl,
        sortOrder: galleryWorks.sortOrder,
        publishedAt: galleryWorks.publishedAt,
      })
      .from(galleryWorks)
      .where(cursorCondition ? and(where, cursorCondition) as ReturnType<typeof and> : where)
      .orderBy(asc(galleryWorks.sortOrder), desc(galleryWorks.publishedAt), galleryWorks.slug)
      .limit(effectiveLimit + 1)

    const rows = await queryBuilder

    const hasMore = rows.length > effectiveLimit
    const slice = rows.slice(0, effectiveLimit)

    const items: GalleryCardItem[] = slice.map((r) => ({
      slug: r.slug,
      title: r.title,
      category: r.category,
      tags: r.tags,
      thumbnailUrl: r.thumbnailUrl,
    }))

    let nextCursor: string | null = null
    if (hasMore && slice.length > 0) {
      const last = slice[slice.length - 1]!
      nextCursor = encodeCursor({
        sortOrder: last.sortOrder,
        publishedAt: last.publishedAt.toISOString(),
        slug: last.slug,
      })
    }

    return { items, nextCursor, hasMore, status: 200 }
  }

  /**
   * Get full detail for a single gallery work, including prev/next navigation.
   */
  async detail(slug: string): Promise<
    | { item: GalleryDetailItem; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    // Fetch the current work
    const rows = await db
      .select()
      .from(galleryWorks)
      .where(and(eq(galleryWorks.slug, slug), eq(galleryWorks.status, "active")))
      .limit(1)

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Gallery work not found" }, status: 404 }
    }

    const work = rows[0]!
    const pubAt = work.publishedAt.toISOString() // Convert to string for sql template compatibility

    // Get prev/next slugs by finding adjacent rows in the global sort order.
    // This queries for the work just before and just after in the composite sort.
    const [prevResult] = await db
      .select({ slug: galleryWorks.slug })
      .from(galleryWorks)
      .where(and(
        eq(galleryWorks.status, "active"),
        sql`(
          ${galleryWorks.sortOrder} < ${work.sortOrder}
        ) OR (
          ${galleryWorks.sortOrder} = ${work.sortOrder} AND ${galleryWorks.publishedAt} > ${pubAt}::timestamptz
        ) OR (
          ${galleryWorks.sortOrder} = ${work.sortOrder} AND ${galleryWorks.publishedAt} = ${pubAt}::timestamptz AND ${galleryWorks.slug} < ${work.slug}
        )`,
      ))
      .orderBy(desc(galleryWorks.sortOrder), asc(galleryWorks.publishedAt), desc(galleryWorks.slug))
      .limit(1)

    const [nextResult] = await db
      .select({ slug: galleryWorks.slug })
      .from(galleryWorks)
      .where(and(
        eq(galleryWorks.status, "active"),
        sql`(
          ${galleryWorks.sortOrder} > ${work.sortOrder}
        ) OR (
          ${galleryWorks.sortOrder} = ${work.sortOrder} AND ${galleryWorks.publishedAt} < ${pubAt}::timestamptz
        ) OR (
          ${galleryWorks.sortOrder} = ${work.sortOrder} AND ${galleryWorks.publishedAt} = ${pubAt}::timestamptz AND ${galleryWorks.slug} > ${work.slug}
        )`,
      ))
      .orderBy(asc(galleryWorks.sortOrder), desc(galleryWorks.publishedAt), galleryWorks.slug)
      .limit(1)

    return {
      item: {
        slug: work.slug,
        title: work.title,
        category: work.category,
        tags: work.tags,
        prompt: work.prompt,
        imageUrl: work.imageUrl,
        navigation: {
          prevSlug: prevResult?.slug ?? null,
          nextSlug: nextResult?.slug ?? null,
        },
      },
      status: 200,
    }
  }

  /**
   * Import gallery works from a manifest JSON file + local image directory.
   * Uses slug as the idempotency key — re-running with the same slug
   * updates the existing record (upsert).
   */
  async importFromManifest(
    manifestPath: string,
    imageDir: string,
  ): Promise<
    | { result: ImportResult; status: 200 }
    | { error: { code: string; message: string }; status: number }
  > {
    // ── Read and validate manifest ──
    let manifest: Manifest
    try {
      const raw = readFileSync(manifestPath, "utf-8")
      manifest = JSON.parse(raw) as Manifest
    } catch (e) {
      logger.error({ manifestPath, error: String(e) }, "gallery.import: failed to read manifest")
      return { error: { code: "VALIDATION_ERROR", message: `Failed to read manifest: ${String(e)}` }, status: 400 }
    }

    if (!manifest.works || !Array.isArray(manifest.works) || manifest.works.length === 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Manifest must contain a non-empty 'works' array" }, status: 400 }
    }

    // ── Process each work ──
    const result: ImportResult = { total: manifest.works.length, created: 0, updated: 0, failed: 0, errors: [] }

    for (const entry of manifest.works) {
      try {
        const existed = await this.upsertWork(entry, imageDir)
        if (existed) {
          result.updated++
        } else {
          result.created++
        }
      } catch (e) {
        result.failed++
        result.errors.push({ slug: entry.slug, error: String(e) })
        logger.error({ slug: entry.slug, error: String(e) }, "gallery.import: failed to import work")
      }
    }

    logger.info({
      total: result.total,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
    }, "gallery.import: complete")

    return { result, status: 200 }
  }

  /**
   * Upsert a single gallery work from a manifest entry.
   * Returns true if the slug already existed (update), false if new (create).
   */
  private async upsertWork(entry: ManifestWorkEntry, imageDir: string): Promise<boolean> {
    // Validate required fields
    if (!entry.slug || !entry.title || !entry.category || !entry.prompt || !entry.imageFile) {
      throw new Error(`Missing required fields for slug: ${entry.slug}`)
    }

    if (!isValidCategory(entry.category)) {
      throw new Error(`Invalid category '${entry.category}' for slug: ${entry.slug}`)
    }

    const imagePath = join(imageDir, entry.imageFile)
    if (!existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`)
    }

    // ── Copy image to gallery storage ──
    const ext = extname(entry.imageFile).toLowerCase()
    const mime = getMimeFromExt(ext) ?? "image/png"

    const galleryDir = join(COS_BASE_PATH, "gallery", entry.slug)
    mkdirSync(galleryDir, { recursive: true })

    const storedName = `original${ext}`
    const storagePath = join(galleryDir, storedName)
    const imageData = readFileSync(imagePath)
    writeFileSync(storagePath, imageData)

    // Image key: relative path from COS_BASE_PATH
    const imageKey = `gallery/${entry.slug}/${storedName}`

    // ── Thumbnail placeholder ──
    // NOTE: No real thumbnail generation capability yet.
    // Using the same image as thumbnail for now — real impl should resize.
    const thumbnailName = `thumbnail${ext}`
    const thumbnailPath = join(galleryDir, thumbnailName)
    writeFileSync(thumbnailPath, imageData) // THUMBNAIL_PLACEHOLDER: copy of original
    const thumbnailKey = `gallery/${entry.slug}/${thumbnailName}`

    // ── Public URLs ──
    // NOTE: These are COS direct-path URLs. In production with CDN,
    // replace with the CDN-prefixed URL. For now, use a relative path
    // that the frontend can resolve via the assets serving layer.
    const imageUrl = `/api/platform/files/${imageKey}`
    const thumbnailUrl = `/api/platform/files/${thumbnailKey}`

    // ── Upsert DB record ──
    const now = new Date()
    const publishedAt = entry.publishedAt ? new Date(entry.publishedAt) : now

    // Check if slug already exists
    const existing = await db
      .select({ id: galleryWorks.id })
      .from(galleryWorks)
      .where(eq(galleryWorks.slug, entry.slug))
      .limit(1)

    if (existing.length > 0) {
      // Update
      await db
        .update(galleryWorks)
        .set({
          title: entry.title,
          category: entry.category,
          tags: entry.tags ?? null,
          prompt: entry.prompt,
          sortOrder: entry.sortOrder ?? 0,
          publishedAt,
          imageKey,
          thumbnailKey,
          imageUrl,
          thumbnailUrl,
          mime,
          width: null,
          height: null,
          updatedAt: now,
        })
        .where(eq(galleryWorks.slug, entry.slug))
      logger.info({ slug: entry.slug }, "gallery.import: updated existing work")
      return true
    } else {
      // Insert
      await db.insert(galleryWorks).values({
        id: galleryWorkId(),
        slug: entry.slug,
        title: entry.title,
        category: entry.category,
        tags: entry.tags ?? null,
        prompt: entry.prompt,
        sortOrder: entry.sortOrder ?? 0,
        publishedAt,
        imageKey,
        thumbnailKey,
        imageUrl,
        thumbnailUrl,
        mime,
        width: null,
        height: null,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      logger.info({ slug: entry.slug }, "gallery.import: created new work")
      return false
    }
  }
}

export const galleryService = new GalleryService()
