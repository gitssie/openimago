import { pgTable, text, timestamp, integer, real, uniqueIndex } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  email: text("email").unique(),
  workspaceId: text("workspace_id"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const userAuths = pgTable("user_auths", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  providerId: text("provider_id"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userProviderIdx: uniqueIndex("user_auths_user_provider_idx").on(table.userId, table.provider),
}))

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  fullPath: text("full_path").notNull().unique(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const workDirs = pgTable("work_dirs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  projectId: text("project_id").references(() => projects.id),
  type: text("type").notNull(),
  fullPath: text("full_path").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const promptTemplates = pgTable("prompt_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  storedName: text("stored_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  duration: real("duration"),
  thumbnailPath: text("thumbnail_path"),
  storagePath: text("storage_path").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
