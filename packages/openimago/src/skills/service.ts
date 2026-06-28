// ── SkillConfigService ────────────────────────────────────────────────────────
//
// Per-user, user-authored skill management. A single per-user skill library; the
// DB row (user_skills) is the single source of truth. CRUD does NOT touch disk.
//
// Skills are materialized into a project ONLY when the user actually uses it
// (session create) via syncUserSkillsToDir, which writes each active skill to
// ${targetDir}/.opencode/skills/<name>/SKILL.md so opencode discovers it natively
// through its walk-up `.opencode` discovery (openimago-680i).
//
// The injectable SkillFileSystem (mirrors WorkDirService.FileSystem) keeps the
// disk side unit-testable.

import { mkdir, writeFile, rm, readdir } from "node:fs/promises"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { userSkills } from "../db/schema"
import { skillId } from "../utils/ids"
import { logger } from "../server/logger"

// Slug convention: lowercase alphanumeric + internal hyphens only.
// Disallows leading/trailing hyphens since the name becomes a directory name.
const SKILL_NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const MAX_NAME_LEN = 64
const MAX_DESCRIPTION_LEN = 1024

// ── Pure helpers (unit-testable, no DB / no fs) ───────────────────────────────

/**
 * Validate a skill name: 1-64 chars, slug convention (lowercase alphanumeric
 * with internal hyphens, no leading/trailing hyphen). The pattern rejects
 * `.`, `..`, `/` and any traversal, and keeps the on-disk directory name clean.
 */
export function validateSkillName(name: string): boolean {
  if (!name || name.length === 0 || name.length > MAX_NAME_LEN) return false
  return SKILL_NAME_RE.test(name)
}

/** Validate a skill description: non-empty, <= 1024 chars. */
export function validateSkillDescription(description: string): boolean {
  if (!description || description.length === 0) return false
  return description.length <= MAX_DESCRIPTION_LEN
}

/** YAML-escape a frontmatter scalar, quoting only when necessary. */
function yamlScalar(value: string): string {
  // Quote if it contains characters that would break a bare YAML scalar.
  if (/[:#"\n]/.test(value) || value.trim() !== value) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  }
  return value
}

/**
 * Serialize a skill to SKILL.md text: YAML frontmatter (name, description)
 * followed by a blank line and the instructions-only body. Pure.
 */
export function serializeSkillMd(name: string, description: string, content: string): string {
  const frontmatter = `---\nname: ${yamlScalar(name)}\ndescription: ${yamlScalar(description)}\n---`
  const body = content.endsWith("\n") ? content : `${content}\n`
  return `${frontmatter}\n\n${body}`
}

// ── Injectable filesystem (mirrors WorkDirService.FileSystem) ─────────────────

export interface SkillFileSystem {
  mkdir(dir: string): Promise<void>
  writeFile(file: string, data: string): Promise<void>
  rm(dir: string): Promise<void>
  /** List the entries of a directory. Used by sync to prune deleted skills. */
  readdir(dir: string): Promise<string[]>
}

const realFs: SkillFileSystem = {
  mkdir: async (dir) => { await mkdir(dir, { recursive: true }) },
  writeFile: async (file, data) => { await writeFile(file, data, "utf-8") },
  rm: async (dir) => { await rm(dir, { recursive: true, force: true }) },
  readdir: async (dir) => {
    try {
      return await readdir(dir)
    } catch {
      // Missing dir → nothing to prune.
      return []
    }
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateSkillInput {
  userId: string
  name: string
  description: string
  content: string
}

export interface UpdateSkillInput {
  userId: string
  name: string
  description?: string
  content?: string
}

interface SkillDto {
  id: string
  name: string
  description: string
  content: string
  status: string
  createdAt: string
  updatedAt: string
}

type ServiceError = { error: { code: string; message: string }; status: number }

function isError<T>(v: T | ServiceError): v is ServiceError {
  return typeof v === "object" && v !== null && "error" in v
}

// ── Service ─────────────────────────────────────────────────────────────────

export class SkillConfigService {
  private readonly fs: SkillFileSystem

  constructor(fs: SkillFileSystem = realFs) {
    this.fs = fs
  }

  private toDto(row: typeof userSkills.$inferSelect): SkillDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async create(input: CreateSkillInput): Promise<{ skill: SkillDto; status: 201 } | ServiceError> {
    if (!validateSkillName(input.name)) {
      return {
        error: { code: "VALIDATION_ERROR", message: "Name must be 1-64 chars, lowercase alphanumeric + hyphen" },
        status: 400,
      }
    }
    if (!validateSkillDescription(input.description)) {
      return {
        error: { code: "VALIDATION_ERROR", message: "Description must be 1-1024 characters" },
        status: 400,
      }
    }
    if (!input.content || input.content.trim().length === 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Content must not be empty" }, status: 400 }
    }

    // Collision check (the unique (userId, name) index is the hard guarantee).
    const existing = await db
      .select({ id: userSkills.id })
      .from(userSkills)
      .where(and(eq(userSkills.userId, input.userId), eq(userSkills.name, input.name)))
      .limit(1)
    if (existing.length > 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Skill name already exists" }, status: 400 }
    }

    const id = skillId()
    const now = new Date()
    let row: typeof userSkills.$inferSelect
    try {
      const inserted = await db
        .insert(userSkills)
        .values({
          id,
          userId: input.userId,
          name: input.name,
          description: input.description,
          content: input.content,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      row = inserted[0]!
    } catch (err) {
      // Unique-index race → treat as collision.
      logger.warn({ userId: input.userId, name: input.name, err }, "skills.create: insert failed")
      return { error: { code: "VALIDATION_ERROR", message: "Skill name already exists" }, status: 400 }
    }

    logger.info({ userId: input.userId, skillId: id, name: input.name }, "skills.create: created")
    return { skill: this.toDto(row), status: 201 }
  }

  async list(input: { userId: string }): Promise<{ skills: SkillDto[]; status: 200 } | ServiceError> {
    const rows = await db
      .select()
      .from(userSkills)
      .where(eq(userSkills.userId, input.userId))
    return { skills: rows.map((r) => this.toDto(r)), status: 200 }
  }

  async get(input: { userId: string; name: string }): Promise<{ skill: SkillDto; status: 200 } | ServiceError> {
    const rows = await db
      .select()
      .from(userSkills)
      .where(and(eq(userSkills.userId, input.userId), eq(userSkills.name, input.name)))
      .limit(1)
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Skill not found" }, status: 404 }
    }
    return { skill: this.toDto(rows[0]!), status: 200 }
  }

  async update(input: UpdateSkillInput): Promise<{ skill: SkillDto; status: 200 } | ServiceError> {
    if (input.description !== undefined && !validateSkillDescription(input.description)) {
      return { error: { code: "VALIDATION_ERROR", message: "Description must be 1-1024 characters" }, status: 400 }
    }
    if (input.content !== undefined && input.content.trim().length === 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Content must not be empty" }, status: 400 }
    }

    const rows = await db
      .select()
      .from(userSkills)
      .where(and(eq(userSkills.userId, input.userId), eq(userSkills.name, input.name)))
      .limit(1)
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Skill not found" }, status: 404 }
    }

    const current = rows[0]!
    const description = input.description ?? current.description
    const content = input.content ?? current.content
    const now = new Date()

    const updated = await db
      .update(userSkills)
      .set({ description, content, updatedAt: now })
      .where(eq(userSkills.id, current.id))
      .returning()

    logger.info({ userId: input.userId, name: input.name }, "skills.update: updated")
    return { skill: this.toDto(updated[0]!), status: 200 }
  }

  async remove(input: { userId: string; name: string }): Promise<{ status: 200 } | ServiceError> {
    const rows = await db
      .select({ id: userSkills.id })
      .from(userSkills)
      .where(and(eq(userSkills.userId, input.userId), eq(userSkills.name, input.name)))
      .limit(1)
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Skill not found" }, status: 404 }
    }

    await db.delete(userSkills).where(eq(userSkills.id, rows[0]!.id))
    logger.info({ userId: input.userId, name: input.name }, "skills.remove: removed")
    return { status: 200 }
  }

  /**
   * Materialize all of a user's `active` skills into
   * `${targetDir}/.opencode/skills/<name>/SKILL.md`, then PRUNE any skill dir
   * under `${targetDir}/.opencode/skills/` that is not in the user's current DB
   * set (so deletes propagate). Called on session-create to land skills in the
   * project the user is actually using. Best-effort; callers wrap it non-fatally.
   */
  async syncUserSkillsToDir(userId: string, targetDir: string): Promise<void> {
    const rows = await db
      .select()
      .from(userSkills)
      .where(and(eq(userSkills.userId, userId), eq(userSkills.status, "active")))

    const skillsRoot = path.join(targetDir, ".opencode", "skills")
    const active = new Set<string>()

    for (const row of rows) {
      active.add(row.name)
      const dir = path.join(skillsRoot, row.name)
      await this.fs.mkdir(dir)
      await this.fs.writeFile(
        path.join(dir, "SKILL.md"),
        serializeSkillMd(row.name, row.description, row.content),
      )
    }

    // Prune skill dirs that are no longer in the user's DB set.
    const existing = await this.fs.readdir(skillsRoot)
    for (const entry of existing) {
      if (!active.has(entry)) {
        await this.fs.rm(path.join(skillsRoot, entry))
      }
    }

    logger.info({ userId, targetDir, written: rows.length }, "skills.sync: user skills synced to dir")
  }
}

export const skillConfigService = new SkillConfigService()
