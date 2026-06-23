import { mkdir, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { eq, and, sql, isNull } from "drizzle-orm"
import { db } from "../db/client"
import { projects, users } from "../db/schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { SessionTable } from "../db/session-schema"
import { projectId } from "../utils/ids"
import { logger } from "../server/logger"

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

export interface CreateProjectInput {
  userId: string
  name: string
  description?: string
}

export interface UpdateProjectInput {
  projectId: string
  userId: string
  name?: string
  description?: string
  status?: "archived"
}

export class ProjectService {
  async create(input: CreateProjectInput) {
    if (!input.name || input.name.trim().length === 0 || input.name.length > 64) {
      logger.warn({ userId: input.userId, name: input.name }, "project.create: validation error")
      return { error: { code: "VALIDATION_ERROR", message: "Name must be 1-64 characters" }, status: 400 } as const
    }

    const id = projectId()
    const directory = `${COS_BASE_PATH}/${id}`
    const now = new Date()

    await mkdir(directory, { recursive: true })

    await db.insert(projects).values({
      id,
      userId: input.userId,
      name: input.name.trim(),
      description: input.description ?? null,
      directory,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    // Link the user's workspace to this project via WorkspaceTable.
    // Also ensure the opencode workspace.directory points to the project directory.
    const [user] = await db
      .select({ workspaceId: users.workspaceId })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1)

    if (user?.workspaceId) {
      // Point the workspace at this project directory
      await db
        .insert(WorkspaceTable)
        .values({
          id: user.workspaceId,
          type: "local",
          name: input.name.trim(),
          directory,
          project_id: id,
          time_used: Date.now(),
          userId: input.userId,
        })
        .onConflictDoUpdate({
          target: WorkspaceTable.id,
          set: { directory, name: input.name.trim(), userId: input.userId, project_id: id },
        })
    }

    // Scaffold AI-readable project files.
    // Non-fatal: project creation succeeds even if scaffolding partially fails.
    await this.scaffoldProjectFiles(id, input.name.trim(), directory, now).catch((err) => {
      logger.warn({ projectId: id, err }, "project.create: scaffold failed — continuing")
    })

    logger.info({ userId: input.userId, projectId: id, name: input.name.trim(), directory }, "project.create: project created")
    return {
      project: {
        id,
        name: input.name.trim(),
        description: input.description ?? null,
        directory,
        status: "active" as const,
        createdAt: now.toISOString(),
      },
      status: 201,
    } as const
  }

  /**
   * Scaffold AI-readable project files in the project directory.
   * Skips any file that already exists (no overwrite).
   *
   * Public so the seed script can reuse the exact AGENTS.md + manifest
   * scaffolding (then overwrite the story/*.json with fixtures).
   */
  async scaffoldProjectFiles(
    projectId: string,
    projectName: string,
    directory: string,
    createdAt: Date,
  ) {
    const now = createdAt.toISOString()

    // --- AGENTS.md ---
    const agentsPath = path.join(directory, "AGENTS.md")
    if (!(await this.fileExists(agentsPath))) {
      const agentsContent = [
        `# ${projectName}`,
        "",
        "## Canonical Layout",
        "",
        "```",
        `${directory}/`,
        "  AGENTS.md              # this file — AI navigation/operating guide",
        "  openimago.json         # machine manifest (schema version, paths)",
        "  story/",
        "    bible.json           # world settings, characters, scenes, style seeds",
        "    series.json          # series/episode index and status",
        "    episodes/ep_001.json # episode 1: script + storyboard",
        "    workflow/ep_001.workflow.json  # episode 1 generation DAG",
        "    runs/ep_001.runs.json          # episode 1 run history",
        "  outputs/               # generated artifacts",
        "  assets/                # uploaded references",
        "```",
        "",
        "## Current Focus",
        "",
        "- **Status:** active",
        `- **Project ID:** ${projectId}`,
        `- **Created:** ${now}`,
        "- **Current Focus:** Story planning / initial concept art",
        "",
        "## Rules for AI Agents",
        "",
        "Story state lives in `story/*.json` files — the filesystem is the canonical",
        "source of truth. Do NOT duplicate story content into a database. Use stable",
        "slugs for all IDs (never auto-increment integers). Every JSON file carries a",
        "`schemaVersion`. Generated artifacts live in `outputs/` and are referenced by",
        "`artifactId`. Never mutate old runs — `runs.json` is append-only.",
        "",
        "### The Generation Closed Loop (do this for EVERY asset you generate)",
        "",
        "The 5 layers must stay linked: bible → episodes → workflow → runs → artifacts.",
        "Generating an image WITHOUT recording the workflow node + run leaves the shot",
        "orphaned (no link from shot to artifact). Follow the loop:",
        "",
        "1. **Author the generation DAG** in `story/workflow/ep_NNN.workflow.json`:",
        "   - Concept-art nodes with `shotId: null` (one per character / scene / style).",
        "   - Shot nodes with `shotId` set to the `EpisodeShot.id`, `dependsOn` listing",
        "     the concept node ids they build on.",
        "   - `params.promptTemplate` uses `{{character.<id>.<field>}}`,",
        "     `{{scene.<id>.<field>}}`, `{{style.<id>.<field>}}`, `{{shot.<id>.<field>}}`",
        "     tokens that resolve against bible.json / the episode.",
        "2. **Generate the asset** by calling the `image_generate` tool WITH the story",
        "   context: `projectId`, `episodeId`, `shotId`, `nodeId`. This stamps the",
        "   artifact's provenance so it can be correlated back to the shot/node.",
        "3. **Record a GenerationRun** by appending to `story/runs/ep_NNN.runs.json`",
        "   `runs[]`: the `nodeId`, `shotId` (must match the node's `shotId`), resolved",
        "   `params`, and a `result` with the `artifactId` + `access` from the tool's",
        "   returned artifact, plus `status` and timestamps. Example:",
        "",
        "```json",
        "{",
        '  "id": "run_kai_concept_v1",',
        '  "nodeId": "n01-char-kai-concept",',
        '  "shotId": null,',
        '  "status": "completed",',
        '  "params": { "prompt": "<resolved prompt>", "model": "flux-pro", "seed": 42, "referenceArtifactIds": [] },',
        '  "result": {',
        '    "artifactId": "<workspaceFileId from image_generate>",',
        '    "kind": "image",',
        '    "mime": "image/png",',
        '    "filename": "kai-concept-v1.png",',
        '    "access": { "preview": "<preview href from tool>" }',
        "  },",
        '  "startedAt": "2026-06-08T10:00:00Z",',
        '  "completedAt": "2026-06-08T10:00:15Z"',
        "}",
        "```",
        "",
        "   For a VIDEO run, also copy these from the artifact into the run's `result`",
        "   (the backend probes them when the video artifact is created — set async, so",
        "   read once available; skip if absent):",
        "   - `result.duration` = the artifact's REAL duration in seconds. REQUIRED for",
        "     the timeline: clip width / ruler / per-second cells use it; without it the",
        "     assembler falls back to the shot's estimate and the clip is mis-sized.",
        "   - `result.access.filmstrip` (URL) + `result.filmstrip` dims",
        "     `{ frameCount, frameW, frameH }` — the precomputed timeline filmstrip",
        "     sprite the NLE renders (openimago-k6bl).",
        "",
        "4. **Validate before declaring done.** Run the `validate_story` tool and fix",
        "   EVERY error it reports — treat it exactly like `typecheck`: the story is not",
        "   done until `validate_story` is green. It checks the full graph (schema, slug",
        "   ids, template-ref resolution, node/shot/run/artifact linkage, and that every",
        "   generated shot has a node + a completed run + a real artifact).",
        "",
        "Keep this AGENTS.md up to date as the project evolves.",
        "",
      ].join("\n")
      await writeFile(agentsPath, agentsContent, "utf-8")
      logger.info({ projectId, file: "AGENTS.md" }, "project.create: scaffolded AGENTS.md")
    }

    // --- openimago.json ---
    const manifestPath = path.join(directory, "openimago.json")
    if (!(await this.fileExists(manifestPath))) {
      const manifest = {
        schemaVersion: 1,
        projectId,
        createdAt: now,
        storyPath: "story/",
        outputsPath: "outputs/",
      }
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "openimago.json" }, "project.create: scaffolded openimago.json")
    }

    // --- story/ directory ---
    const storyDir = path.join(directory, "story")
    await mkdir(storyDir, { recursive: true })

    // --- story/bible.json ---
    const biblePath = path.join(storyDir, "bible.json")
    if (!(await this.fileExists(biblePath))) {
      const bible = {
        schemaVersion: 1,
        projectId,
        world: {
          name: projectName,
          description: "",
          era: "",
          moodKeywords: [] as string[],
          visualStyleNotes: "",
        },
        characters: [] as Record<string, unknown>[],
        scenes: [] as Record<string, unknown>[],
        styleSeeds: [] as Record<string, unknown>[],
        updatedAt: now,
      }
      await writeFile(biblePath, JSON.stringify(bible, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "story/bible.json" }, "project.create: scaffolded story/bible.json")
    }

    // --- story/series.json ---
    const seriesPath = path.join(storyDir, "series.json")
    if (!(await this.fileExists(seriesPath))) {
      const series = {
        schemaVersion: 1,
        projectId,
        title: projectName,
        description: "",
        status: "planning" as const,
        episodes: [] as Record<string, unknown>[],
        updatedAt: now,
      }
      await writeFile(seriesPath, JSON.stringify(series, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "story/series.json" }, "project.create: scaffolded story/series.json")
    }

    // --- story/episodes/ ---
    const episodesDir = path.join(storyDir, "episodes")
    await mkdir(episodesDir, { recursive: true })

    // --- story/episodes/ep_001.json ---
    const ep001Path = path.join(episodesDir, "ep_001.json")
    if (!(await this.fileExists(ep001Path))) {
      const episode = {
        schemaVersion: 1,
        id: "ep_001",
        episodeNumber: 1,
        title: "",
        logline: "",
        synopsis: "",
        status: "draft" as const,
        shots: [] as Record<string, unknown>[],
        updatedAt: now,
      }
      await writeFile(ep001Path, JSON.stringify(episode, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "story/episodes/ep_001.json" }, "project.create: scaffolded story/episodes/ep_001.json")
    }

    // --- story/workflow/ ---
    const workflowDir = path.join(storyDir, "workflow")
    await mkdir(workflowDir, { recursive: true })

    // --- story/workflow/ep_001.workflow.json ---
    const workflowPath = path.join(workflowDir, "ep_001.workflow.json")
    if (!(await this.fileExists(workflowPath))) {
      const workflow = {
        schemaVersion: 1,
        episodeId: "ep_001",
        nodes: [] as Record<string, unknown>[],
        edges: [] as Record<string, unknown>[],
      }
      await writeFile(workflowPath, JSON.stringify(workflow, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "story/workflow/ep_001.workflow.json" }, "project.create: scaffolded story/workflow/ep_001.workflow.json")
    }

    // --- story/runs/ ---
    const runsDir = path.join(storyDir, "runs")
    await mkdir(runsDir, { recursive: true })

    // --- story/runs/ep_001.runs.json ---
    const runsPath = path.join(runsDir, "ep_001.runs.json")
    if (!(await this.fileExists(runsPath))) {
      const runs = {
        schemaVersion: 1,
        episodeId: "ep_001",
        runs: [] as Record<string, unknown>[],
      }
      await writeFile(runsPath, JSON.stringify(runs, null, 2) + "\n", "utf-8")
      logger.info({ projectId, file: "story/runs/ep_001.runs.json" }, "project.create: scaffolded story/runs/ep_001.runs.json")
    }
  }

  /** Check whether a file exists without throwing. */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }

  async list(input: { userId: string; status?: string }) {
    const conditions = [eq(projects.userId, input.userId)]
    if (input.status) {
      conditions.push(eq(projects.status, input.status))
    }

    const rows = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(sql`${projects.createdAt} DESC`)

    const result = await Promise.all(
      rows.map(async (p) => {
        const stats = await this.queryProjectStats(p.id)
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          directory: p.directory,
          status: p.status,
          sessionCount: stats.sessionCount,
          totalCost: stats.totalCost,
          lastActivityAt: stats.lastActivityAt,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        }
      }),
    )

    return { projects: result, status: 200 } as const
  }

  async getStats(projectId: string, userId: string) {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 } as const
    }

    const project = rows[0]!

    if (project.userId !== userId) {
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 } as const
    }

    const stats = await this.queryProjectStats(project.id)
    return { stats, status: 200 } as const
  }

    private async queryProjectStats(projectId: string) {
    const result = await db
      .select({
        sessionCount: sql<number>`COUNT(*)::int`,
        totalTokensInput: sql<number>`COALESCE(SUM(${SessionTable.tokens_input}), 0)::bigint`,
        totalTokensOutput: sql<number>`COALESCE(SUM(${SessionTable.tokens_output}), 0)::bigint`,
        totalTokensReasoning: sql<number>`COALESCE(SUM(${SessionTable.tokens_reasoning}), 0)::bigint`,
        totalTokensCacheRead: sql<number>`COALESCE(SUM(${SessionTable.tokens_cache_read}), 0)::bigint`,
        totalTokensCacheWrite: sql<number>`COALESCE(SUM(${SessionTable.tokens_cache_write}), 0)::bigint`,
        totalCost: sql<number>`COALESCE(SUM(${SessionTable.cost}), 0)::double precision`,
        lastActivityAt: sql<number | null>`MAX(${SessionTable.time_updated})`,
      })
      .from(SessionTable)
      .where(
        and(
          eq(SessionTable.project_id, projectId),
          isNull(SessionTable.time_archived),
        ),
      )

    const row = result[0]!
    return {
      sessionCount: Number(row.sessionCount),
      totalTokensInput: Number(row.totalTokensInput),
      totalTokensOutput: Number(row.totalTokensOutput),
      totalTokensReasoning: Number(row.totalTokensReasoning),
      totalTokensCacheRead: Number(row.totalTokensCacheRead),
      totalTokensCacheWrite: Number(row.totalTokensCacheWrite),
      totalCost: Number(row.totalCost),
      lastActivityAt: row.lastActivityAt ? new Date(Number(row.lastActivityAt)).toISOString() : null,
    }
  }

  async getById(projectId: string, userId: string) {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 } as const
    }

    const project = rows[0]!

    if (project.userId !== userId) {
      logger.warn({ userId, projectId }, "project.getById: forbidden — not owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 } as const
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        directory: project.directory,
        status: project.status,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      },
      status: 200,
    } as const
  }

  async update(input: UpdateProjectInput) {
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 } as const
    }

    const project = rows[0]!

    if (project.userId !== input.userId) {
      logger.warn({ userId: input.userId, projectId: input.projectId }, "project.update: forbidden — not owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 } as const
    }

    const updates: Record<string, any> = { updatedAt: new Date() }
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.description !== undefined) updates.description = input.description
    if (input.status !== undefined) updates.status = input.status

    await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, input.projectId))

    const updated = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))

    const p = updated[0]!
    logger.info({ userId: input.userId, projectId: input.projectId }, "project.update: project updated")
    return {
      project: {
        id: p.id,
        name: p.name,
        description: p.description,
        directory: p.directory,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      },
      status: 200,
    } as const
  }
}

export const projectService = new ProjectService()
