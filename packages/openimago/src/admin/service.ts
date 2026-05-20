import { eq, or, like, sql } from "drizzle-orm"
import { db } from "../db/client"
import { users } from "../db/schema"

export interface ListUsersQuery {
  search?: string
  limit?: number
  offset?: number
}

export class AdminService {
  async listUsers(query: ListUsersQuery) {
    const { search, limit = 50, offset = 0 } = query
    const effectiveLimit = Math.min(limit, 200)

    let where = undefined
    if (search) {
      const pattern = `%${search}%`
      where = or(like(users.username, pattern), like(users.email, pattern))
    }

    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(users)
        .where(where)
        .limit(effectiveLimit)
        .offset(offset)
        .orderBy(users.createdAt),
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(where),
    ])

    const total = Number(totalResult[0]?.count ?? 0)
    return { users: rows, total }
  }

  async updateRole(adminId: string, targetUserId: string, newRole: string) {
    if (targetUserId === adminId) {
      return { error: { code: "CANNOT_SELF_DEMOTE", message: "Cannot change your own role" }, status: 400 } as const
    }

    if (newRole !== "admin" && newRole !== "user") {
      return { error: { code: "VALIDATION_ERROR", message: `Invalid role: ${newRole}` }, status: 400 } as const
    }

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))

    if (userRows.length === 0) {
      return { error: { code: "NOT_FOUND", message: "User not found" }, status: 404 } as const
    }

    const now = new Date()
    await db
      .update(users)
      .set({ role: newRole, updatedAt: now })
      .where(eq(users.id, targetUserId))

    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))

    return { user: updated[0]!, status: 200 } as const
  }
}

export const adminService = new AdminService()
