import { sql } from "drizzle-orm"
import { migrate, truncate } from "../src/db/migrate"
import { db } from "../src/db/client"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { generateWorkspaceId } from "../src/auth/workspace-id"

/** Base path for working directories — matches src/workdir/service.ts and src/project/service.ts */
export const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/mnt/cos"

/**
 * Ensure a workspace record exists in OpenCode's workspace table.
 * Used by tests that need a workspace without going through user registration.
 * Returns the generated workspace ID (wrk_ prefix, OpenCode-compatible format).
 */
export async function ensureWorkspace(): Promise<string> {
  const id = generateWorkspaceId()
  await db
    .insert(WorkspaceTable)
    .values({
      id,
      type: "worktree",
      name: "",
      directory: COS_BASE_PATH,
      project_id: "global",
      time_used: Date.now(),
    })
    .onConflictDoNothing()
  return id
}

export async function setup() {
  await migrate()
  await truncate()
}

export async function setupSessionTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'global',
      workspace_id TEXT,
      parent_id TEXT,
      slug TEXT NOT NULL DEFAULT '',
      directory TEXT NOT NULL,
      path TEXT,
      title TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      share_url TEXT,
      summary_additions INTEGER,
      summary_deletions INTEGER,
      summary_files INTEGER,
      summary_diffs JSONB,
      cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      tokens_input BIGINT NOT NULL DEFAULT 0,
      tokens_output BIGINT NOT NULL DEFAULT 0,
      tokens_reasoning BIGINT NOT NULL DEFAULT 0,
      tokens_cache_read BIGINT NOT NULL DEFAULT 0,
      tokens_cache_write BIGINT NOT NULL DEFAULT 0,
      revert JSONB,
      permission JSONB,
      agent TEXT,
      model JSONB,
      time_created BIGINT NOT NULL DEFAULT 0,
      time_updated BIGINT NOT NULL DEFAULT 0,
      time_compacting BIGINT,
      time_archived BIGINT
    )
  `)
}

export async function setupMessageTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created BIGINT NOT NULL DEFAULT 0,
      time_updated BIGINT NOT NULL DEFAULT 0,
      data JSONB NOT NULL DEFAULT '{}'
    )
  `)
}

export async function teardown() {
  await truncate()
}
