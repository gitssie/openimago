import { test, expect, describe } from "bun:test"
import {
  completedRunArtifacts,
  picsumUrlFor,
  rewriteRunImageUrls,
  trimSeriesToPresent,
  withProjectId,
} from "../scripts/seed-helpers"

describe("withProjectId", () => {
  test("overrides projectId, preserving other fields", () => {
    const out = withProjectId({ projectId: "proj_old", title: "Neon Drift" }, "proj_seed")
    expect(out.projectId).toBe("proj_seed")
    expect(out.title).toBe("Neon Drift")
  })

  test("adds projectId when the doc has none", () => {
    const out = withProjectId({ title: "x" }, "proj_seed")
    expect(out.projectId).toBe("proj_seed")
  })
})

describe("trimSeriesToPresent", () => {
  test("keeps only episodes whose id is present, in order", () => {
    const series = {
      schemaVersion: 1,
      episodes: [
        { id: "ep_001", title: "A" },
        { id: "ep_002", title: "B" },
        { id: "ep_003", title: "C" },
      ],
    }
    const out = trimSeriesToPresent(series, ["ep_001"])
    expect((out.episodes as { id: string }[]).map((e) => e.id)).toEqual(["ep_001"])
    // Other fields preserved.
    expect(out.schemaVersion).toBe(1)
  })

  test("returns an empty episodes array when none are present", () => {
    const out = trimSeriesToPresent({ episodes: [{ id: "ep_002" }] }, ["ep_001"])
    expect(out.episodes).toEqual([])
  })

  test("tolerates a missing/invalid episodes field", () => {
    const out = trimSeriesToPresent({ schemaVersion: 1 }, ["ep_001"])
    expect(out.episodes).toEqual([])
  })
})

describe("completedRunArtifacts", () => {
  test("collects result artifacts from completed runs only", () => {
    const runsDoc = {
      runs: [
        {
          status: "completed",
          result: {
            artifactId: "wf_a",
            kind: "image",
            mime: "image/png",
            filename: "a.png",
            access: { preview: "http://x/a.png", thumbnail: "http://x/a.thumb.webp" },
          },
        },
        // running run has no result → skipped
        { status: "running" },
        // completed but no artifactId → skipped
        { status: "completed", result: { kind: "image" } },
      ],
    }
    const out = completedRunArtifacts(runsDoc)
    expect(out).toHaveLength(1)
    expect(out[0]!.artifactId).toBe("wf_a")
    expect(out[0]!.previewHref).toBe("http://x/a.png")
    expect(out[0]!.thumbnailHref).toBe("http://x/a.thumb.webp")
  })

  test("returns empty when there are no runs", () => {
    expect(completedRunArtifacts({ schemaVersion: 1 })).toEqual([])
  })
})

describe("picsumUrlFor", () => {
  test("uses aspect-ratio dimensions and a smaller same-seed thumbnail", () => {
    const a = picsumUrlFor("wf_x", "16:9")
    expect(a.preview).toMatch(/^https:\/\/picsum\.photos\/seed\/[a-z0-9]+\/1280\/720$/)
    // Thumbnail keeps the ratio at 320px wide (720/1280*320 = 180).
    expect(a.thumbnail).toMatch(/^https:\/\/picsum\.photos\/seed\/[a-z0-9]+\/320\/180$/)
    // Same seed → preview & thumbnail share the same picsum seed segment.
    const seedSeg = (u: string) => u.split("/seed/")[1]!.split("/")[0]
    expect(seedSeg(a.preview)).toBe(seedSeg(a.thumbnail))
  })

  test("maps 3:4 and 2:3 ratios; defaults to 16:9", () => {
    expect(picsumUrlFor("s", "3:4").preview).toContain("/600/800")
    expect(picsumUrlFor("s", "2:3").preview).toContain("/600/900")
    expect(picsumUrlFor("s").preview).toContain("/1280/720")
    expect(picsumUrlFor("s", "weird").preview).toContain("/1280/720")
  })

  test("is deterministic and distinct per seed", () => {
    expect(picsumUrlFor("a", "16:9").preview).toBe(picsumUrlFor("a", "16:9").preview)
    expect(picsumUrlFor("a", "16:9").preview).not.toBe(picsumUrlFor("b", "16:9").preview)
  })
})

describe("rewriteRunImageUrls", () => {
  test("replaces completed image runs' access URLs with picsum, by artifactId + aspectRatio", () => {
    const doc = {
      runs: [
        {
          status: "completed",
          params: { aspectRatio: "3:4" },
          result: {
            artifactId: "wf_kai",
            kind: "image",
            access: { preview: "https://cdn.example.com/x.png", thumbnail: "https://cdn.example.com/x.thumb.webp" },
          },
        },
        // running run → untouched
        { status: "running", params: {} },
      ],
    }
    const out = rewriteRunImageUrls(doc)
    const r0 = (out.runs as any[])[0]
    expect(r0.result.access.preview).toBe(picsumUrlFor("wf_kai", "3:4").preview)
    expect(r0.result.access.thumbnail).toBe(picsumUrlFor("wf_kai", "3:4").thumbnail)
    expect(r0.result.access.preview).not.toContain("cdn.example.com")
    // Non-completed run is left as-is.
    expect((out.runs as any[])[1].status).toBe("running")
    // Input not mutated.
    expect((doc.runs[0] as any).result.access.preview).toBe("https://cdn.example.com/x.png")
  })
})
