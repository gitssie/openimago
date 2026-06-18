import { createMiddleware } from "hono/factory"

/**
 * Cross-origin isolation headers for the omniclip Cut editor (ADR 0007).
 *
 * The Cut editor relies on SharedArrayBuffer + WebCodecs + ffmpeg.wasm, all of
 * which require the document to be *cross-origin-isolated*. That demands two
 * response headers on the served document:
 *   - Cross-Origin-Opener-Policy: same-origin
 *   - Cross-Origin-Embedder-Policy: require-corp
 *
 * Under `require-corp`, every subresource the isolated document fetches must
 * itself carry a Cross-Origin-Resource-Policy (CORP) header (or be served with
 * CORS `crossorigin`), or the browser blocks it. The backend serves project
 * media (gallery/files) that the SPA — a different origin in dev — fetches, so
 * we set a permissive `cross-origin` CORP by default. Handlers that need a
 * stricter policy can set CORP themselves; this middleware never overwrites a
 * value a handler already chose.
 *
 * Mirrors the Vite dev server (packages/web/quasar.config.ts) and the prod
 * nginx serve (packages/web/nginx.conf). (openimago-c80q)
 */
export function crossOriginIsolation() {
  return createMiddleware(async (c, next) => {
    await next()
    c.header("Cross-Origin-Opener-Policy", "same-origin")
    c.header("Cross-Origin-Embedder-Policy", "require-corp")
    if (!c.res.headers.has("Cross-Origin-Resource-Policy")) {
      c.header("Cross-Origin-Resource-Policy", "cross-origin")
    }
  })
}
