import { pgTable, text, bigint, jsonb, timestamp } from "drizzle-orm/pg-core"

/**
 * Read/write schema for OpenCode's `workspace` table.
 * Openimago adds user_id / created_at columns on the shared table,
 * eliminating the need for a separate workspace_refs join table.
 * Reuses OpenCode's existing `project_id` column for project references.
 */
export const WorkspaceTable = pgTable("workspace", {
  id: text().primaryKey(),
  type: text().notNull(),
  name: text().notNull().default(""),
  branch: text(),
  directory: text(),
  extra: jsonb(),
  project_id: text().notNull(),
  time_used: bigint({ mode: "number" }).notNull(),
  // ── openimago-owned columns ──
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
