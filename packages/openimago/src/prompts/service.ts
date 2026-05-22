import { eq, and, or, like, sql } from "drizzle-orm"
import { db } from "../db/client"
import { promptTemplates } from "../db/schema"
import { userId as genUserId } from "../utils/ids"

function tplId(): string {
  return `tpl_${genUserId().slice(4)}`
}

export interface CreatePromptInput {
  title: string
  content: string
  tags?: string[]
}

export interface UpdatePromptInput {
  title?: string
  content?: string
  tags?: string[]
}

export interface ListPromptsQuery {
  tag?: string
  search?: string
  order?: "asc" | "desc"
  limit?: number
  offset?: number
}

export class PromptsService {
  async create(userId: string, input: CreatePromptInput) {
    if (!input.title || input.title.trim().length === 0 || input.title.length > 64) {
      return { error: { code: "VALIDATION_ERROR", message: "Title must be 1-64 characters" }, status: 400 } as const
    }
    if (!input.content || input.content.trim().length === 0) {
      return { error: { code: "VALIDATION_ERROR", message: "Content is required" }, status: 400 } as const
    }

    const id = tplId()
    const now = new Date()

    await db.insert(promptTemplates).values({
      id,
      userId,
      title: input.title.trim(),
      content: input.content,
      tags: input.tags ?? null,
      createdAt: now,
      updatedAt: now,
    })

    return {
      template: { id, title: input.title.trim(), content: input.content, tags: input.tags ?? null, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      status: 201,
    } as const
  }

  async list(userId: string, query: ListPromptsQuery) {
    const { tag, search, order = "desc", limit = 50, offset = 0 } = query
    const effectiveLimit = Math.min(limit, 200)

    const conditions = [eq(promptTemplates.userId, userId)]

    if (tag) {
      conditions.push(sql`${tag} = ANY(${promptTemplates.tags})`)
    }

    if (search) {
      const pattern = `%${search}%`
      const searchCondition = or(
          like(promptTemplates.title, pattern),
          like(promptTemplates.content, pattern),
        )
        if (searchCondition) conditions.push(searchCondition)
    }

    const where = and(...conditions)

    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(promptTemplates)
        .where(where)
        .orderBy(order === "asc" ? promptTemplates.updatedAt : sql`${promptTemplates.updatedAt} DESC`)
        .limit(effectiveLimit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(promptTemplates)
        .where(where),
    ])

    const total = Number(totalResult[0]?.count ?? 0)

    const templates = rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      tags: r.tags,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))

    return { templates, total, status: 200 } as const
  }

  async get(userId: string, templateId: string) {
    const rows = await db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, templateId), eq(promptTemplates.userId, userId)))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Template not found" }, status: 404 } as const
    }

    const r = rows[0]!
    return {
      template: {
        id: r.id,
        title: r.title,
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      },
      status: 200,
    } as const
  }

  async update(userId: string, templateId: string, input: UpdatePromptInput) {
    const rows = await db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, templateId), eq(promptTemplates.userId, userId)))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Template not found" }, status: 404 } as const
    }

    const updates: Record<string, any> = { updatedAt: new Date() }
    if (input.title !== undefined) {
      if (!input.title || input.title.length > 64) {
        return { error: { code: "VALIDATION_ERROR", message: "Title must be 1-64 characters" }, status: 400 } as const
      }
      updates.title = input.title.trim()
    }
    if (input.content !== undefined) updates.content = input.content
    if (input.tags !== undefined) updates.tags = input.tags

    await db
      .update(promptTemplates)
      .set(updates)
      .where(eq(promptTemplates.id, templateId))

    const updated = await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, templateId))

    const r = updated[0]!
    return {
      template: {
        id: r.id,
        title: r.title,
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      },
      status: 200,
    } as const
  }

  async delete(userId: string, templateId: string) {
    const rows = await db
      .select()
      .from(promptTemplates)
      .where(and(eq(promptTemplates.id, templateId), eq(promptTemplates.userId, userId)))

    if (rows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "Template not found" }, status: 404 } as const
    }

    await db.delete(promptTemplates).where(eq(promptTemplates.id, templateId))
    return { deleted: true, status: 200 } as const
  }
}

export const promptsService = new PromptsService()
