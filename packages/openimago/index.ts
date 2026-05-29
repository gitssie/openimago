import { createApp } from "./src/server/app"
import { migrate } from "./src/db/migrate"
import { existsSync } from "fs"
import { logger } from "./src/server/logger"

const FRONTEND_DIST = "../web/dist"

await migrate()

const port = Number(process.env.PORT) || 5467
const host = process.env.HOST || "0.0.0.0"

const app = createApp()

// Production: serve built frontend static files
const distExists = existsSync(FRONTEND_DIST) && existsSync(`${FRONTEND_DIST}/index.html`)
if (distExists) {
  const MIME: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  }

  app.get("/*", async (c) => {
    const url = new URL(c.req.url)
    const path = url.pathname

    // API routes pass through
    if (path.startsWith("/auth/") || path.startsWith("/api/") || path === "/health") {
      return c.notFound()
    }

    // Try to serve static file
    const filePath = path === "/" ? "/index.html" : path
    const fullPath = `${FRONTEND_DIST}${filePath}`
    const file = Bun.file(fullPath)

    if (await file.exists()) {
      const ext = filePath.substring(filePath.lastIndexOf("."))
      return new Response(file, {
        headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
      })
    }

    // SPA fallback
    const indexHtml = await Bun.file(`${FRONTEND_DIST}/index.html`).text()
    return c.html(indexHtml)
  })
}

export default {
  port,
  hostname: host,
  fetch: app.fetch,
  // Disable idle timeout for SSE long-lived connections.
  // Default is 10s which kills SSE streams between heartbeats.
  idleTimeout: 0,
}

logger.info({ host, port, frontendServed: distExists }, "openimago server started")
