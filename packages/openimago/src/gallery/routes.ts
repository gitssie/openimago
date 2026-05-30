import { Hono } from "hono"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { authMiddleware } from "../server/middleware"
import { galleryService } from "./service"
import { logger } from "../server/logger"

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

export const galleryRoutes = new Hono()

galleryRoutes.use("/*", authMiddleware)

// ═════════════════════════════════════════════════════════════════════════
// GET / — list gallery works (cursor pagination, optional category filter)
// ═════════════════════════════════════════════════════════════════════════

galleryRoutes.get("/", async (c) => {
  const category = c.req.query("category")
  const cursor = c.req.query("cursor")
  const limit = parseInt(c.req.query("limit") ?? "20", 10)

  const result = await galleryService.list({ category, cursor, limit: Number.isFinite(limit) ? limit : 20 })

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore })
})

// ═════════════════════════════════════════════════════════════════════════
// GET /:slug — get full detail for a gallery work
// ═════════════════════════════════════════════════════════════════════════

galleryRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug")
  const result = await galleryService.detail(slug)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ item: result.item })
})

// ═════════════════════════════════════════════════════════════════════════
// POST /import — import works from manifest JSON + image directory
// ═════════════════════════════════════════════════════════════════════════

galleryRoutes.post("/import", async (c) => {
  const body = await c.req.json() as { manifestPath?: string; imageDir?: string }

  if (!body.manifestPath || !body.imageDir) {
    return c.json({
      error: { code: "VALIDATION_ERROR", message: "manifestPath and imageDir are required" },
    }, 400)
  }

  const result = await galleryService.importFromManifest(body.manifestPath, body.imageDir)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ result: result.result }, 200)
})

// ═════════════════════════════════════════════════════════════════════════
// GET /files/:slug/:filename — serve gallery image file from disk
// ═════════════════════════════════════════════════════════════════════════
// NOTE: This is a simple static file server for gallery images.
// In production, replace with CDN / S3 presigned URLs.

// This route must be registered LAST to avoid stealing :slug matches.
// Place it as a separate router or ensure it's after the :slug detail route.

const galleryFilesRoutes = new Hono()
galleryFilesRoutes.use("/*", authMiddleware)

galleryFilesRoutes.get("/:slug/:filename", async (c) => {
  const slug = c.req.param("slug")
  const filename = c.req.param("filename")

  // Sanitize: prevent path traversal
  if (slug.includes("..") || filename.includes("..") || slug.includes("/") || filename.includes("/")) {
    return c.json({ error: { code: "FORBIDDEN", message: "Invalid path" } }, 403)
  }

  const filePath = join(COS_BASE_PATH, "gallery", slug, filename)

  if (!existsSync(filePath)) {
    return c.json({ error: { code: "NOT_FOUND", message: "File not found" } }, 404)
  }

  try {
    const data = readFileSync(filePath)
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")).toLowerCase() : ""
    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    }
    const contentType = mimeMap[ext] ?? "application/octet-stream"

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    })
  } catch (e) {
    logger.error({ filePath, error: String(e) }, "gallery.files: failed to read file")
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Failed to read file" } }, 500)
  }
})

export { galleryFilesRoutes }
