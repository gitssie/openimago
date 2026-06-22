import { test, expect, describe } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  validateStoryGraph,
  type StoryValidationInput,
} from "../src/project/story-validation"

// ── Load the canonical docs/story-schema fixtures (the clean green story) ─────

const FIXTURE_ROOT = join(import.meta.dir, "..", "..", "..", "docs", "story-schema")

async function readFixture<T>(relativePath: string): Promise<T> {
  const raw = await readFile(join(FIXTURE_ROOT, relativePath), "utf-8")
  return JSON.parse(raw) as T
}

/**
 * Build a validation input from the canonical fixtures. The fixture runs.json
 * references artifactIds wf_01h_kai_concept / wf_01h_rei_concept /
 * wf_01h_neon_alley / wf_01h_shot01, so the known-artifact set must contain
 * them for run.result.artifactId resolution to pass.
 */
async function loadCleanInput(): Promise<StoryValidationInput> {
  const bible = await readFixture("bible.json")
  const series = await readFixture("series.json")
  const episode = await readFixture("episodes/ep_001.json")
  const workflow = await readFixture("workflow/ep_001.workflow.json")
  const runs = await readFixture("runs/ep_001.runs.json")

  return {
    bible: { file: "story/bible.json", data: bible },
    series: { file: "story/series.json", data: series },
    episodes: [{ file: "story/episodes/ep_001.json", data: episode }],
    workflows: [{ file: "story/workflow/ep_001.workflow.json", data: workflow }],
    runs: [{ file: "story/runs/ep_001.runs.json", data: runs }],
    // series.json plans 3 episodes (docs only ship ep_001's full layer, but in
    // a real project all declared episode files exist).
    presentEpisodeIds: ["ep_001", "ep_002", "ep_003"],
    knownArtifactIds: new Set([
      "wf_01h_kai_concept",
      "wf_01h_rei_concept",
      "wf_01h_neon_alley",
      "wf_01h_shot01",
    ]),
  }
}

/** Deep clone a parsed doc so a mutation in one test cannot leak to another. */
function cloneDoc(doc: { file: string; data: unknown }): { file: string; data: any } {
  return { file: doc.file, data: structuredClone(doc.data) }
}

const codes = (report: { errors: { code: string }[] }): string[] => report.errors.map((e) => e.code)

describe("validateStoryGraph — clean fixture", () => {
  test("the canonical docs/story-schema story validates ok with no errors", async () => {
    const input = await loadCleanInput()
    const report = validateStoryGraph(input)

    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
  })
})

describe("validateStoryGraph — referential integrity defects", () => {
  test("dangling node.shotId → DANGLING_SHOT_REF", async () => {
    const input = await loadCleanInput()
    const wf = cloneDoc(input.workflows[0]!)
    // n07 points at a real shot; repoint it at a non-existent shot.
    wf.data.nodes.find((n: any) => n.id === "n07-shot-s01-opening").shotId = "s99-ghost"
    input.workflows = [wf]

    const report = validateStoryGraph(input)
    expect(report.ok).toBe(false)
    const dangling = report.errors.filter((e) => e.code === "DANGLING_SHOT_REF")
    expect(dangling).toHaveLength(1)
    expect(dangling[0]!.message).toContain("s99-ghost")
  })

  test("unresolved {{}} template ref → UNRESOLVED_TEMPLATE_REF", async () => {
    const input = await loadCleanInput()
    const wf = cloneDoc(input.workflows[0]!)
    wf.data.nodes[0].params.promptTemplate = "art of {{character.nobody.description}}"
    input.workflows = [wf]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("UNRESOLVED_TEMPLATE_REF")
  })

  test("template ref to unknown field on a known entity → UNRESOLVED_TEMPLATE_FIELD", async () => {
    const input = await loadCleanInput()
    const wf = cloneDoc(input.workflows[0]!)
    wf.data.nodes[0].params.promptTemplate = "art of {{character.kai-the-runner.notAField}}"
    input.workflows = [wf]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("UNRESOLVED_TEMPLATE_FIELD")
  })

  test("run.nodeId referencing a missing node → DANGLING_NODE_REF", async () => {
    const input = await loadCleanInput()
    const runs = cloneDoc(input.runs[0]!)
    runs.data.runs[0].nodeId = "n99-ghost-node"
    input.runs = [runs]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("DANGLING_NODE_REF")
  })

  test("missing run.nodeId → MISSING_NODE_REF", async () => {
    const input = await loadCleanInput()
    const runs = cloneDoc(input.runs[0]!)
    delete runs.data.runs[0].nodeId
    input.runs = [runs]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("MISSING_NODE_REF")
  })

  test("run.result.artifactId that resolves to no real artifact → DANGLING_ARTIFACT_REF", async () => {
    const input = await loadCleanInput()
    // Drop one fixture artifact from the known set.
    input.knownArtifactIds = new Set(
      [...input.knownArtifactIds].filter((id) => id !== "wf_01h_kai_concept"),
    )

    const report = validateStoryGraph(input)
    const dangling = report.errors.filter((e) => e.code === "DANGLING_ARTIFACT_REF")
    expect(dangling).toHaveLength(1)
    expect(dangling[0]!.message).toContain("wf_01h_kai_concept")
  })

  test("dangling shot.sceneId → DANGLING_SCENE_REF", async () => {
    const input = await loadCleanInput()
    const ep = cloneDoc(input.episodes[0]!)
    ep.data.shots[0].sceneId = "nowhere-scene"
    input.episodes = [ep]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("DANGLING_SCENE_REF")
  })

  test("series references an episode with no file → MISSING_EPISODE_FILE", async () => {
    const input = await loadCleanInput()
    input.presentEpisodeIds = ["ep_001", "ep_002"] // ep_003 now "missing"

    const report = validateStoryGraph(input)
    const missing = report.errors.filter((e) => e.code === "MISSING_EPISODE_FILE")
    expect(missing).toHaveLength(1)
    expect(missing[0]!.message).toContain("ep_003")
  })
})

describe("validateStoryGraph — association completeness", () => {
  test("a shot marked generated with no completed run → MISSING_COMPLETED_RUN", async () => {
    const input = await loadCleanInput()
    const ep = cloneDoc(input.episodes[0]!)
    // s08 has a workflow node (n14) but no completed run in the fixture.
    ep.data.shots.find((s: any) => s.id === "s08-cliffhanger").status = "generated"
    input.episodes = [ep]

    const report = validateStoryGraph(input)
    const missing = report.errors.filter((e) => e.code === "MISSING_COMPLETED_RUN")
    expect(missing).toHaveLength(1)
    expect(missing[0]!.message).toContain("s08-cliffhanger")
  })

  test("a shot marked generated with no workflow node → MISSING_WORKFLOW_NODE", async () => {
    const input = await loadCleanInput()
    const ep = cloneDoc(input.episodes[0]!)
    const wf = cloneDoc(input.workflows[0]!)
    // Remove the node for s02, then mark s02 generated.
    wf.data.nodes = wf.data.nodes.filter((n: any) => n.shotId !== "s02-kai-defeat")
    wf.data.edges = wf.data.edges.filter((e: any) => true)
    ep.data.shots.find((s: any) => s.id === "s02-kai-defeat").status = "generated"
    input.episodes = [ep]
    input.workflows = [wf]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("MISSING_WORKFLOW_NODE")
  })

  test("run.shotId inconsistent with its node's shotId → RUN_SHOT_MISMATCH", async () => {
    const input = await loadCleanInput()
    const runs = cloneDoc(input.runs[0]!)
    // run for n07 (shotId s01-opening) — flip its shotId to a different shot.
    runs.data.runs.find((r: any) => r.nodeId === "n07-shot-s01-opening").shotId = "s02-kai-defeat"
    input.runs = [runs]

    const report = validateStoryGraph(input)
    expect(codes(report)).toContain("RUN_SHOT_MISMATCH")
  })
})

describe("validateStoryGraph — orphan artifacts (warnings)", () => {
  test("a stamped artifact not referenced by any run → ORPHAN_ARTIFACT warning", async () => {
    const input = await loadCleanInput()
    input.knownArtifactIds = new Set([...input.knownArtifactIds, "wf_orphan_unlinked"])
    input.stampedArtifacts = [{ artifactId: "wf_orphan_unlinked", shotId: "s05-rei-plan" }]

    const report = validateStoryGraph(input)
    // Orphans are warnings, not errors — the graph is still ok.
    expect(report.ok).toBe(true)
    expect(report.warnings.map((w) => w.code)).toContain("ORPHAN_ARTIFACT")
  })

  test("a stamped artifact that IS referenced by a run is not an orphan", async () => {
    const input = await loadCleanInput()
    input.stampedArtifacts = [{ artifactId: "wf_01h_kai_concept", shotId: null, nodeId: "n01-char-kai-concept" }]

    const report = validateStoryGraph(input)
    expect(report.warnings.map((w) => w.code)).not.toContain("ORPHAN_ARTIFACT")
  })
})
