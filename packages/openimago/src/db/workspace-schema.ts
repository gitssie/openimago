import { pgTable, text, bigint, jsonb } from "drizzle-orm/pg-core"

/**
 * Read/write schema for OpenCode's `workspace` table.
 * Defined here so openimago can create workspace records before
 * forwarding requests with a ?workspace= query parameter.
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
})
