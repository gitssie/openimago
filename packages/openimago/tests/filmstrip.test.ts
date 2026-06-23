import { test, expect, describe } from "bun:test"
import {
  FILMSTRIP_FRAME_COUNT,
  FILMSTRIP_FRAME_W,
  FILMSTRIP_FRAME_H,
  filmstripMeta,
  filmstripFileName,
  filmstripStoragePath,
  filmstripUrlFrom,
  buildFilmstripFfmpegArgs,
} from "../src/media/filmstrip"

// Pure-parts unit tests (openimago-k6bl). The ffmpeg spawn + storage write are IO
// and validated in the browser/integration; these cover the deterministic core.

describe("filmstripMeta — contract dims (must match the client)", () => {
  test("is 24 frames at 28×50 (9:16 portrait)", () => {
    expect(filmstripMeta()).toEqual({ frameCount: 24, frameW: 28, frameH: 50 })
    expect(FILMSTRIP_FRAME_COUNT).toBe(24)
    expect(FILMSTRIP_FRAME_W).toBe(28)
    expect(FILMSTRIP_FRAME_H).toBe(50)
    // 9:16 within rounding (28/50 = 0.56 ≈ 0.5625).
    expect(Math.abs(FILMSTRIP_FRAME_W / FILMSTRIP_FRAME_H - 9 / 16)).toBeLessThan(0.01)
  })
})

describe("filmstripFileName / filmstripStoragePath", () => {
  test("names the sprite <artifactId>.filmstrip.png", () => {
    expect(filmstripFileName("wf_abc")).toBe("wf_abc.filmstrip.png")
  })
  test("writes next to the artifact in the output dir", () => {
    expect(filmstripStoragePath("/opt/work/proj_1/outputs", "wf_abc")).toBe(
      "/opt/work/proj_1/outputs/wf_abc.filmstrip.png",
    )
  })
})

describe("filmstripUrlFrom — mirrors the preview/thumbnail URL scheme", () => {
  test("swaps the basename of a relative preview URL", () => {
    expect(filmstripUrlFrom("/mock/shot-s01.mp4", "shot-s01")).toBe("/mock/shot-s01.filmstrip.png")
  })
  test("swaps the basename of an absolute http(s) URL (same host/scheme)", () => {
    expect(filmstripUrlFrom("https://cdn.example.com/outputs/wf_x.mp4", "wf_x")).toBe(
      "https://cdn.example.com/outputs/wf_x.filmstrip.png",
    )
  })
  test("ignores query string and hash on the reference URL", () => {
    expect(filmstripUrlFrom("/mock/clip.mp4?token=1#t=2", "wf_y")).toBe("/mock/wf_y.filmstrip.png")
  })
  test("falls back to bare filename when the reference URL has no path", () => {
    expect(filmstripUrlFrom("clip.mp4", "wf_z")).toBe("wf_z.filmstrip.png")
  })
})

describe("buildFilmstripFfmpegArgs — exact documented command", () => {
  const args = buildFilmstripFfmpegArgs("/in.mp4", "/out.filmstrip.png")

  test("passes input, single-frame output, overwrite", () => {
    expect(args[0]).toBe("-i")
    expect(args[1]).toBe("/in.mp4")
    expect(args).toContain("-frames:v")
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1")
    expect(args).toContain("-y")
    expect(args[args.length - 1]).toBe("/out.filmstrip.png")
  })

  test("the -vf filter selects every floor(total/24)-th frame, cover-crops 28×50, tiles 24x1", () => {
    const vf = args[args.indexOf("-vf") + 1]!
    expect(vf).toContain("T*FR/24")
    expect(vf).toContain("scale=28:50:force_original_aspect_ratio=increase")
    expect(vf).toContain("crop=28:50")
    expect(vf).toContain("tile=24x1")
    // select(...) and the mod-based interval (escaped comma) are present.
    expect(vf).toMatch(/select='not\(mod\(n\\,floor\(max\(1\\,T\*FR\/24\)\)\)\)'/)
  })

  test("honors custom dims", () => {
    const a = buildFilmstripFfmpegArgs("/i.mp4", "/o.png", { frameCount: 12, frameW: 40, frameH: 60 })
    const vf = a[a.indexOf("-vf") + 1]!
    expect(vf).toContain("T*FR/12")
    expect(vf).toContain("scale=40:60")
    expect(vf).toContain("tile=12x1")
  })
})
