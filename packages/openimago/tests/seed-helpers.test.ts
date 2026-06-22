import { test, expect, describe } from "bun:test"
import {
  completedRunArtifacts,
  rewriteRunImageUrls,
  sameOriginPlaceholderFor,
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

describe("sameOriginPlaceholderFor", () => {
  test("returns relative same-origin /mock/*.svg by aspect ratio (no external host)", () => {
    const a = sameOriginPlaceholderFor("16:9")
    expect(a.preview).toBe("/mock/placeholder-16x9.svg")
    // Preview and thumbnail share the same scalable SVG.
    expect(a.thumbnail).toBe(a.preview)
    // Relative same-origin — never an external host.
    expect(a.preview.startsWith("/")).toBe(true)
    expect(a.preview).not.toContain("://")
  })

  test("maps each known aspect ratio; defaults to 16:9", () => {
    expect(sameOriginPlaceholderFor("3:4").preview).toBe("/mock/placeholder-3x4.svg")
    expect(sameOriginPlaceholderFor("2:3").preview).toBe("/mock/placeholder-2x3.svg")
    expect(sameOriginPlaceholderFor("1:1").preview).toBe("/mock/placeholder-1x1.svg")
    expect(sameOriginPlaceholderFor().preview).toBe("/mock/placeholder-16x9.svg")
    expect(sameOriginPlaceholderFor("weird").preview).toBe("/mock/placeholder-16x9.svg")
  })

  test("is deterministic regardless of seed", () => {
    expect(sameOriginPlaceholderFor("16:9", "a").preview).toBe(sameOriginPlaceholderFor("16:9", "b").preview)
  })
})

describe("rewriteRunImageUrls", () => {
  test("replaces completed image runs' access URLs with same-origin placeholders by aspectRatio", () => {
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
    expect(r0.result.access.preview).toBe("/mock/placeholder-3x4.svg")
    expect(r0.result.access.thumbnail).toBe("/mock/placeholder-3x4.svg")
    expect(r0.result.access.preview).not.toContain("cdn.example.com")
    expect(r0.result.access.preview).not.toContain("://")
    // Non-completed run is left as-is.
    expect((out.runs as any[])[1].status).toBe("running")
    // Input not mutated.
    expect((doc.runs[0] as any).result.access.preview).toBe("https://cdn.example.com/x.png")
  })
})
