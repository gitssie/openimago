import { pgTable, text, bigint, integer, doublePrecision, jsonb, index } from "drizzle-orm/pg-core"

/**
 * Shared schema for OpenCode's `session` table (read-only).
 * Defined here so openimago can query session metadata
 * without duplicating migration ownership.
 */
export const SessionTable = pgTable(
  "session",
  {
    id: text().primaryKey(),
    project_id: text().notNull(),
    workspace_id: text(),
    parent_id: text(),
    slug: text().notNull(),
    directory: text().notNull(),
    path: text(),
    title: text().notNull(),
    version: text().notNull(),
    share_url: text(),
    summary_additions: integer(),
    summary_deletions: integer(),
    summary_files: integer(),
    summary_diffs: jsonb(),
    cost: doublePrecision().notNull().default(0),
    tokens_input: bigint({ mode: "number" }).notNull().default(0),
    tokens_output: bigint({ mode: "number" }).notNull().default(0),
    tokens_reasoning: bigint({ mode: "number" }).notNull().default(0),
    tokens_cache_read: bigint({ mode: "number" }).notNull().default(0),
    tokens_cache_write: bigint({ mode: "number" }).notNull().default(0),
    revert: jsonb(),
    permission: jsonb(),
    agent: text(),
    model: jsonb(),
    time_created: bigint({ mode: "number" }).notNull(),
    time_updated: bigint({ mode: "number" }).notNull(),
    time_compacting: bigint({ mode: "number" }),
    time_archived: bigint({ mode: "number" }),
  },
  (table) => [
    index("session_project_idx").on(table.project_id),
    index("session_workspace_idx").on(table.workspace_id),
    index("session_parent_idx").on(table.parent_id),
  ],
)
