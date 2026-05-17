import { pgTable, text, jsonb, bigint, index } from "drizzle-orm/pg-core"

export const MessageTable = pgTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text().notNull(),
    time_created: bigint({ mode: "number" }).notNull(),
    time_updated: bigint({ mode: "number" }).notNull(),
    data: jsonb().notNull(),
  },
  (table) => [
    index("message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id),
  ],
)

export const PartTable = pgTable(
  "part",
  {
    id: text().primaryKey(),
    message_id: text().notNull(),
    session_id: text().notNull(),
    time_created: bigint({ mode: "number" }).notNull(),
    time_updated: bigint({ mode: "number" }).notNull(),
    data: jsonb().notNull(),
  },
  (table) => [
    index("part_message_id_id_idx").on(table.message_id, table.id),
    index("part_session_idx").on(table.session_id),
  ],
)
