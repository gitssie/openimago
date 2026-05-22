import { mkdir } from "node:fs/promises"
import { eq, and } from "drizzle-orm"
import { db } from "../db/client"
import { workDirs, projects } from "../db/schema"
import { dirId } from "../utils/ids"

const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/mnt/cos"

export interface FileSystem {
  mkdir(path: string): Promise<void>
}

const realFs: FileSystem = {
  mkdir: async (path) => { await mkdir(path, { recursive: true }) },
}

export interface CreateSessionDirInput {
  userId: string
  projectId?: string
}

export class WorkDirService {
  private readonly basePath: string
  private readonly fs: FileSystem

  constructor(basePath = COS_BASE_PATH, fs: FileSystem = realFs) {
    this.basePath = basePath
    this.fs = fs
  }

  async createSessionDir(input: CreateSessionDirInput) {
    const now = new Date()

    if (input.projectId) {
      const rows = await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.userId, input.userId),
          ),
        )

      if (rows.length === 0) {
        return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 } as const
      }

      const project = rows[0]!
      const workDir = {
        id: dirId(),
        userId: input.userId,
        projectId: input.projectId,
        type: "session" as const,
        fullPath: project.fullPath,
        status: "active" as const,
        createdAt: now.toISOString(),
      }

      await db.insert(workDirs).values({
        id: workDir.id,
        userId: workDir.userId,
        projectId: workDir.projectId,
        type: workDir.type,
        fullPath: workDir.fullPath,
        status: workDir.status,
        createdAt: now,
        updatedAt: now,
      })

      return { workDir, status: 201 } as const
    }

    const id = dirId()
    const fullPath = `${this.basePath}/${id}`

    await this.fs.mkdir(fullPath)

    const workDir = {
      id,
      userId: input.userId,
      projectId: null as string | null,
      type: "session" as const,
      fullPath,
      status: "active" as const,
      createdAt: now.toISOString(),
    }

    await db.insert(workDirs).values({
      id: workDir.id,
      userId: workDir.userId,
      projectId: workDir.projectId,
      type: workDir.type,
      fullPath: workDir.fullPath,
      status: workDir.status,
      createdAt: now,
      updatedAt: now,
    })

    return { workDir, status: 201 } as const
  }

  async list(input: { userId: string; projectId?: string; type?: string }) {
    const conditions = [eq(workDirs.userId, input.userId)]
    if (input.projectId) conditions.push(eq(workDirs.projectId, input.projectId))
    if (input.type) conditions.push(eq(workDirs.type, input.type))

    const rows = await db
      .select()
      .from(workDirs)
      .where(and(...conditions))

    return {
      workDirs: rows.map((w) => ({
        id: w.id,
        userId: w.userId,
        projectId: w.projectId,
        type: w.type,
        fullPath: w.fullPath,
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
      status: 200,
    } as const
  }
}

export const workDirService = new WorkDirService()
