import { mkdir } from "node:fs/promises"
import { eq, and, sql, isNull } from "drizzle-orm"
import { db } from "../db/client"
import { projects, workDirs } from "../db/schema"
import { SessionTable } from "../db/session-schema"
import { projectId, dirId } from "../utils/ids"

const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/mnt/cos"

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
      return { error: { code: "VALIDATION_ERROR", message: "Name must be 1-64 characters" }, status: 400 } as const
    }

    const id = projectId()
    const fullPath = `${COS_BASE_PATH}/${id}`
    const now = new Date()

    await mkdir(fullPath, { recursive: true })

    await db.insert(projects).values({
      id,
      userId: input.userId,
      name: input.name.trim(),
      description: input.description ?? null,
      fullPath,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(workDirs).values({
      id: dirId(),
      userId: input.userId,
      projectId: id,
      type: "project",
      fullPath,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    return {
      project: {
        id,
        name: input.name.trim(),
        description: input.description ?? null,
        fullPath,
        status: "active" as const,
        createdAt: now.toISOString(),
      },
      status: 201,
    } as const
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
        const stats = await this.queryProjectStats(p.fullPath)
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          fullPath: p.fullPath,
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

    const stats = await this.queryProjectStats(project.fullPath)
    return { stats, status: 200 } as const
  }

  private async queryProjectStats(directory: string) {
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
          eq(SessionTable.directory, directory),
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
    return {
      project: {
        id: p.id,
        name: p.name,
        description: p.description,
        fullPath: p.fullPath,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      },
      status: 200,
    } as const
  }
}

export const projectService = new ProjectService()
