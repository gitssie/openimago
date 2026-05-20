import { eq, and } from "drizzle-orm"
import { existsSync, mkdirSync } from "fs"
import { dirname } from "path"
import { db } from "../db/client"
import { projects, workDirs } from "../db/schema"
import { dirId } from "../utils/ids"

const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/mnt/cos"

function getMaxUploadSize(): number {
  return parseInt(process.env.MAX_UPLOAD_SIZE ?? "104857600", 10) // 100MB default
}

export interface UploadInput {
  userId: string
  file: File
  projectId?: string
  directory?: string
}

export interface FileMeta {
  name: string
  size: number
  path: string
  relativePath: string
}

export class FileService {
  async upload(input: UploadInput): Promise<
    | { file: FileMeta; status: 201 }
    | { error: { code: string; message: string }; status: number }
  > {
    const filename = input.file.name

    // Security: reject path traversal in filename
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return { error: { code: "VALIDATION_ERROR", message: "Invalid filename" }, status: 400 }
    }

    // Size check
    const maxSize = getMaxUploadSize()
    if (input.file.size > maxSize) {
      return { error: { code: "VALIDATION_ERROR", message: `File exceeds maximum size of ${maxSize} bytes` }, status: 400 }
    }

    // Resolve target directory
    let targetDir: string
    let relativePath: string

    if (input.projectId) {
      const projectRows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))

      if (projectRows.length === 0) {
        return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
      }

      const project = projectRows[0]!
      if (project.userId !== input.userId) {
        return { error: { code: "FORBIDDEN", message: "You do not own this project" }, status: 403 }
      }

      targetDir = project.fullPath
      relativePath = filename
    } else {
      // Standalone upload: create a work_dirs entry
      const id = dirId()
      targetDir = `${COS_BASE_PATH}/${id}`
      mkdirSync(targetDir, { recursive: true })

      await db.insert(workDirs).values({
        id,
        userId: input.userId,
        projectId: null,
        type: "upload",
        fullPath: targetDir,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      relativePath = filename
    }

    // Apply subdirectory
    if (input.directory) {
      const subDir = input.directory.replace(/\.\./g, "").replace(/^\/+|\/+$/g, "")
      targetDir = `${targetDir}/${subDir}`
      mkdirSync(targetDir, { recursive: true })
      relativePath = `${subDir}/${filename}`
    }

    const fullPath = `${targetDir}/${filename}`

    // Conflict check
    if (existsSync(fullPath)) {
      return { error: { code: "CONFLICT", message: "File already exists" }, status: 409 }
    }

    // Write file
    await Bun.write(fullPath, input.file)

    return {
      file: {
        name: filename,
        size: input.file.size,
        path: fullPath,
        relativePath,
      },
      status: 201,
    }
  }
}

export const fileService = new FileService()
