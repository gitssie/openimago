// ── Storage Adapter Seam ────────────────────────────────────────────────────
//
// Abstract filesystem operations behind a storage Interface so domain services
// (assets, temp-uploads, attachments) don't write paths, mkdir, or copy files
// inline. Callers ask "write this blob" or "copy from path" instead of
// constructing COS_BASE_PATH + user dir + timestamp subdirs.
//
// Implementations: LocalStorageAdapter (disk), future S3/COS adapters.

import { mkdir, writeFile, copyFile, readFile, access as fsAccess } from "node:fs/promises"
import { join, dirname } from "node:path"

// ── Interface ─────────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** Absolute or storage-relative destination path. */
  destPath: string
  /** Ensure parent directory exists before writing. */
  ensureDir?: boolean
}

export interface CopyOptions {
  sourcePath: string
  destPath: string
  /** Ensure parent directory exists before copying. */
  ensureDir?: boolean
}

export interface StorageAdapter {
  /** Write file contents to a path. Creates parent if ensureDir is true. */
  readonly write: (destPath: string, data: Uint8Array, opts?: Omit<WriteOptions, "destPath">) => Promise<void>

  /** Copy a file from source to dest. */
  readonly copy: (opts: CopyOptions) => Promise<void>

  /** Read a file's full contents. Rejects if the path is missing/unreadable. */
  readonly read: (path: string) => Promise<Uint8Array>

  /** Check if a path exists (resolves true/false, does NOT throw). */
  readonly exists: (path: string) => Promise<boolean>
}

// ── Local filesystem adapter ─────────────────────────────────────────────────

/**
 * LocalStorageAdapter — uses Node fs/promises for disk operations.
 * The default adapter; swap for S3StorageAdapter in production.
 */
export class LocalStorageAdapter implements StorageAdapter {
  async write(destPath: string, data: Uint8Array, opts?: Omit<WriteOptions, "destPath">): Promise<void> {
    if (opts?.ensureDir) {
      await mkdir(dirname(destPath), { recursive: true })
    }
    await writeFile(destPath, data)
  }

  async copy(opts: CopyOptions): Promise<void> {
    if (opts.ensureDir) {
      await mkdir(dirname(opts.destPath), { recursive: true })
    }
    await copyFile(opts.sourcePath, opts.destPath)
  }

  async read(path: string): Promise<Uint8Array> {
    return readFile(path)
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fsAccess(path)
      return true
    } catch {
      return false
    }
  }
}

// ── Singleton (default adapter) ──────────────────────────────────────────────

export const localStorage = new LocalStorageAdapter()
