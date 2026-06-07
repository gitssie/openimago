/**
 * Tests for StorageAdapter — local implementation.
 *
 * Behaviors tested:
 *   1. write() creates a file with content
 *   2. copy() copies a file from source to dest
 *   3. exists() returns true for existing file, false for missing
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { readFile, access } from "node:fs/promises"
import { LocalStorageAdapter, type StorageAdapter } from "../src/storage/adapter"

const TEST_DIR = join("/tmp", `storage-adapter-test-${Date.now()}`)

let storage: StorageAdapter

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true })
  storage = new LocalStorageAdapter()
})

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

describe("LocalStorageAdapter", () => {
  test("write() creates file with correct content", async () => {
    const path = join(TEST_DIR, "write-test.txt")
    const data = new Uint8Array([65, 66, 67]) // "ABC"

    await storage.write(path, data, { ensureDir: true })

    const content = await readFile(path, "utf-8")
    expect(content).toBe("ABC")
  })

  test("copy() copies file from source to dest", async () => {
    const source = join(TEST_DIR, "copy-source.txt")
    const dest = join(TEST_DIR, "copy-dest.txt")
    const data = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"

    await storage.write(source, data)
    await storage.copy({ sourcePath: source, destPath: dest, ensureDir: true })

    const content = await readFile(dest, "utf-8")
    expect(content).toBe("Hello")
  })

  test("exists() returns true for existing file", async () => {
    const path = join(TEST_DIR, "exists-test.txt")
    await storage.write(path, new Uint8Array([1]))

    const result = await storage.exists(path)
    expect(result).toBe(true)
  })

  test("exists() returns false for missing file", async () => {
    const path = join(TEST_DIR, "nonexistent.txt")
    const result = await storage.exists(path)
    expect(result).toBe(false)
  })

  test("write() with ensureDir creates parent directories", async () => {
    const path = join(TEST_DIR, "nested", "deep", "file.txt")
    await storage.write(path, new Uint8Array([42]), { ensureDir: true })

    const exists = await storage.exists(path)
    expect(exists).toBe(true)
  })
})
