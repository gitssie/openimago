import { and, eq, sql } from "drizzle-orm"
import { basename } from "path"
import { db } from "../db/client"
import { tempAttachments } from "../db/schema"
import { userId as genUserId } from "../utils/ids"
import { localStorage, type StorageAdapter } from "../storage/adapter"

if (!process.env.COS_BASE_PATH) {
  throw new Error("COS_BASE_PATH environment variable is required")
}

const COS_BASE_PATH = process.env.COS_BASE_PATH

function tempId(): string {
  return `tmp_${genUserId().slice(4)}`
}

export interface TempUploadResult {
  id: string
  filename: string
  mimeType: string
  size: number
  status: string
}

export class TempUploadService {
  private storage: StorageAdapter

  constructor(storage: StorageAdapter = localStorage) {
    this.storage = storage
  }

  /**
   * Upload a file as a temporary attachment. Files are stored under:
   *   COS_BASE_PATH/.tmp/uploads/<userId>/<batchId>/<safeId>_<safeName>
   */
  async upload(
    userId: string,
    batchId: string,
    file: File,
  ): Promise<TempUploadResult> {
    const id = tempId()
    const safeName = basename(file.name).replace(/\0/g, "") || `${id}.bin`
    const destName = `${id}_${safeName}`

    const uploadDir = `${COS_BASE_PATH}/.tmp/uploads/${userId}/${batchId}`
    const storagePath = `${uploadDir}/${destName}`

    const buffer = new Uint8Array(await file.arrayBuffer())
    await this.storage.write(storagePath, buffer, { ensureDir: true })

    const size = file.size
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h TTL

    await db.insert(tempAttachments).values({
      id,
      userId,
      batchId,
      filename: file.name,
      mimeType: file.type,
      size,
      storagePath,
      status: "pending",
      expiresAt,
    })

    return { id, filename: file.name, mimeType: file.type, size, status: "pending" }
  }

  /** Get a temp attachment by ID, scoped to the owning user */
  async get(userId: string, attachmentId: string) {
    const [row] = await db
      .select()
      .from(tempAttachments)
      .where(
        and(
          eq(tempAttachments.id, attachmentId),
          eq(tempAttachments.userId, userId),
          eq(tempAttachments.status, "pending"),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /** Mark attachment as consumed (after successful copy to session directory) */
  async markConsumed(attachmentId: string) {
    await db
      .update(tempAttachments)
      .set({ status: "consumed" })
      .where(eq(tempAttachments.id, attachmentId))
  }
}

export const tempUploadService = new TempUploadService()
