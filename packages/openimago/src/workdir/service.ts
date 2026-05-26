import { mkdir } from "node:fs/promises"
import { eq, and } from "drizzle-orm"
import { db } from "../db/client"
import { projects } from "../db/schema"
import { logger } from "../server/logger"

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
  basePath?: string
}

export class WorkDirService {
  private readonly basePath: string
  private readonly fs: FileSystem

  constructor(basePath = COS_BASE_PATH, fs: FileSystem = realFs) {
    this.basePath = basePath
    this.fs = fs
  }

  /**
   * Resolve or create the working directory for a new session.
   * - If projectId is given: reuse the project's existing directory.
   * - Standalone: create a unique directory under basePath.
   */
  async createSessionDir(input: CreateSessionDirInput) {
    if (input.projectId) {
      const rows = await db
        .select({ directory: projects.directory })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
        .limit(1)

      if (rows.length === 0) {
        return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 } as const
      }

      logger.info({ userId: input.userId, projectId: input.projectId, directory: rows[0]!.directory }, "workdir.createSessionDir: reusing project directory")
      return { directory: rows[0]!.directory, status: 200 } as const
    }

    // Standalone: generate a unique path
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25)
    const directory = `${input.basePath ?? this.basePath}/${id}`

    await this.fs.mkdir(directory)

    logger.info({ userId: input.userId, directory }, "workdir.createSessionDir: created standalone")
    return { directory, status: 201 } as const
  }
}

export const workDirService = new WorkDirService()
