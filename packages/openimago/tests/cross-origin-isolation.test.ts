import { describe, test, expect } from "bun:test"
import { Hono } from "hono"
import { crossOriginIsolation } from "../src/server/cross-origin-isolation"

// Cross-origin isolation headers for the omniclip Cut editor (ADR 0007,
// openimago-c80q). The editor needs SharedArrayBuffer + WebCodecs + ffmpeg.wasm,
// which require the document to be cross-origin-isolated (COOP+COEP). Media the
// isolated document fetches must carry CORP or it is blocked under COEP.

describe("crossOriginIsolation middleware", () => {
  function appWith(handler: (app: Hono) => void): Hono {
    const app = new Hono()
    app.use("*", crossOriginIsolation())
    handler(app)
    return app
  }

  test("sets COOP: same-origin and COEP: require-corp on responses", async () => {
    const app = appWith((a) => a.get("/", (c) => c.text("ok")))
    const res = await app.fetch(new Request("http://localhost/"))
    expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
    expect(res.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp")
  })

  test("sets a permissive CORP so cross-origin media loads under isolation", async () => {
    const app = appWith((a) => a.get("/media.png", (c) => c.body("x")))
    const res = await app.fetch(new Request("http://localhost/media.png"))
    // require-corp blocks subresources lacking CORP; cross-origin lets the
    // isolated SPA (different origin in dev) still load backend-served media.
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin")
  })

  test("does not clobber a CORP a handler already set", async () => {
    const app = appWith((a) =>
      a.get("/strict", (c) => {
        c.header("Cross-Origin-Resource-Policy", "same-origin")
        return c.text("strict")
      }),
    )
    const res = await app.fetch(new Request("http://localhost/strict"))
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
  })
})
