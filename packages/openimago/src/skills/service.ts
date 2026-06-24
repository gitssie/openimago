// ── SkillConfigService ────────────────────────────────────────────────────────
//
// Per-project, user-authored skill management. The DB row (user_skills) is the
// source of truth; the SKILL.md file on disk is materialized from it so opencode
// discovers it natively at ${projectDir}/.opencode/skills/<name>/SKILL.md.
//
// Mirrors ProjectService.create (validate → id → mkdir → db.insert → write file)
// and WorkDirService's injectable FileSystem so the disk side is unit-testable.

import { mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { and, eq } from "drizzle-orm"
import { db } from "../db/client"
import { projects, userSkills } from "../db/schema"
import { skillId } from "../utils/ids"
import { logger } from "../server/logger"

const SKILL_NAME_RE = /^[a-z0-9-]+$/
const MAX_NAME_LEN = 64
const MAX_DESCRIPTION_LEN = 1024

// ── Pure helpers (unit-testable, no DB / no fs) ───────────────────────────────

/**
 * Validate a skill name: 1-64 chars, lowercase alphanumeric + hyphen only.
 * The character class already rejects `.`, `..`, `/` and any traversal.
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
}

const realFs: SkillFileSystem = {
  mkdir: async (dir) => { await mkdir(dir, { recursive: true }) },
  writeFile: async (file, data) => { await writeFile(file, data, "utf-8") },
  rm: async (dir) => { await rm(dir, { recursive: true, force: true }) },
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateSkillInput {
  userId: string
  projectId: string
  name: string
  description: string
  content: string
}

export interface UpdateSkillInput {
  userId: string
  projectId: string
  name: string
  description?: string
  content?: string
}

interface SkillDto {
  id: string
  projectId: string
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

  /** Resolve the project directory, enforcing ownership (404 missing / 403 wrong owner). */
  private async resolveProjectDir(
    projectId: string,
    userId: string,
  ): Promise<string | ServiceError> {
    const rows = await db
      .select({ directory: projects.directory, userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Project not found" }, status: 404 }
    }
    if (rows[0]!.userId !== userId) {
      logger.warn({ userId, projectId }, "skills: forbidden — not project owner")
      return { error: { code: "FORBIDDEN", message: "Not project owner" }, status: 403 }
    }
    return rows[0]!.directory
  }

  /** Absolute path of a skill's directory inside the project. */
  private skillDir(projectDir: string, name: string): string {
    return path.join(projectDir, ".opencode", "skills", name)
  }

  private toDto(row: typeof userSkills.$inferSelect): SkillDto {
    return {
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      description: row.description,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Materialize (or rewrite) the SKILL.md file for a skill on disk. */
  private async writeSkillFile(
    projectDir: string,
    name: string,
    description: string,
    content: string,
  ): Promise<void> {
    const dir = this.skillDir(projectDir, name)
    await this.fs.mkdir(dir)
    await this.fs.writeFile(path.join(dir, "SKILL.md"), serializeSkillMd(name, description, content))
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

    const dir = await this.resolveProjectDir(input.projectId, input.userId)
    if (isError(dir)) return dir

    // Collision check (the unique (projectId, name) index is the hard guarantee).
    const existing = await db
      .select({ id: userSkills.id })
      .from(userSkills)
      .where(and(eq(userSkills.projectId, input.projectId), eq(userSkills.name, input.name)))
      .limit(1)
    if (existing.length > 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Skill name already exists in project" }, status: 400 }
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
          projectId: input.projectId,
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
      logger.warn({ projectId: input.projectId, name: input.name, err }, "skills.create: insert failed")
      return { error: { code: "VALIDATION_ERROR", message: "Skill name already exists in project" }, status: 400 }
    }

    await this.writeSkillFile(dir, input.name, input.description, input.content)
    logger.info({ userId: input.userId, projectId: input.projectId, skillId: id, name: input.name }, "skills.create: created")
    return { skill: this.toDto(row), status: 201 }
  }

  async list(input: { userId: string; projectId: string }): Promise<{ skills: SkillDto[]; status: 200 } | ServiceError> {
    const dir = await this.resolveProjectDir(input.projectId, input.userId)
    if (isError(dir)) return dir

    const rows = await db
      .select()
      .from(userSkills)
      .where(eq(userSkills.projectId, input.projectId))
    return { skills: rows.map((r) => this.toDto(r)), status: 200 }
  }

  async get(input: { userId: string; projectId: string; name: string }): Promise<{ skill: SkillDto; status: 200 } | ServiceError> {
    const dir = await this.resolveProjectDir(input.projectId, input.userId)
    if (isError(dir)) return dir

    const rows = await db
      .select()
      .from(userSkills)
      .where(and(eq(userSkills.projectId, input.projectId), eq(userSkills.name, input.name)))
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

    const dir = await this.resolveProjectDir(input.projectId, input.userId)
    if (isError(dir)) return dir

    const rows = await db
      .select()
      .from(userSkills)
      .where(and(eq(userSkills.projectId, input.projectId), eq(userSkills.name, input.name)))
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

    await this.writeSkillFile(dir, current.name, description, content)
    logger.info({ projectId: input.projectId, name: input.name }, "skills.update: updated")
    return { skill: this.toDto(updated[0]!), status: 200 }
  }

  async remove(input: { userId: string; projectId: string; name: string }): Promise<{ status: 200 } | ServiceError> {
    const dir = await this.resolveProjectDir(input.projectId, input.userId)
    if (isError(dir)) return dir

    const rows = await db
      .select({ id: userSkills.id })
      .from(userSkills)
      .where(and(eq(userSkills.projectId, input.projectId), eq(userSkills.name, input.name)))
      .limit(1)
    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Skill not found" }, status: 404 }
    }

    await db.delete(userSkills).where(eq(userSkills.id, rows[0]!.id))
    await this.fs.rm(this.skillDir(dir, input.name))
    logger.info({ projectId: input.projectId, name: input.name }, "skills.remove: removed")
    return { status: 200 }
  }
}

export const skillConfigService = new SkillConfigService()
