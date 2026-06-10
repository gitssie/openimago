import { boolean, pgTable, text, timestamp, integer, real, bigint, uniqueIndex, jsonb } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
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
  directory: text("directory").notNull().unique(),
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

export const workspaceGeneratedFiles = pgTable("workspace_generated_files", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  workspaceId: text("workspace_id"),
  kind: text("kind").notNull(),
  mimeType: text("mime_type").notNull(),
  filename: text("filename"),
  width: integer("width"),
  height: integer("height"),
  duration: real("duration"),
  accessLocators: jsonb("access_locators").notNull(),
  prompt: text("prompt"),
  provider: text("provider"),
  model: text("model"),
  metadata: jsonb("metadata"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ── Gallery ─────────────────────────────────────────────────────

export const galleryWorks = pgTable("gallery_works", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  tags: text("tags").array(),
  prompt: text("prompt").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  imageKey: text("image_key").notNull(),
  thumbnailKey: text("thumbnail_key"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"),
  mime: text("mime"),
  width: integer("width"),
  height: integer("height"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ── Billing ─────────────────────────────────────────────────────

export const billingAccounts = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  ownerId: text("owner_id").notNull(),
  currency: text("currency").notNull().default("CNY"),
  balanceMicros: bigint("balance_micros", { mode: "number" }).notNull().default(0),
  minimumBalanceMicros: bigint("minimum_balance_micros", { mode: "number" }).notNull().default(0),
  creditLimitMicros: bigint("credit_limit_micros", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ownerIdx: uniqueIndex("billing_accounts_owner_idx").on(table.ownerType, table.ownerId),
}))

export const billingLedger = pgTable("billing_ledger", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => billingAccounts.id),
  userId: text("user_id").notNull(),
  workspaceId: text("workspace_id"),
  projectId: text("project_id"),
  sessionId: text("session_id"),
  entryType: text("entry_type").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  sourceStatus: text("source_status").notNull().default("pending"),
  provider: text("provider"),
  model: text("model"),
  toolName: text("tool_name"),
  mediaKind: text("media_kind"),
  quantity: integer("quantity"),
  unit: text("unit"),
  amountMicros: bigint("amount_micros", { mode: "number" }).notNull(),
  balanceAfterMicros: bigint("balance_after_micros", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("CNY"),
  pricingSnapshot: jsonb("pricing_snapshot"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const billingCdcProcessedEvents = pgTable("billing_cdc_processed_events", {
  id: text("id").primaryKey(),
  sourceLsn: text("source_lsn").notNull(),
  txid: text("txid").notNull(),
  tableName: text("table_name").notNull(),
  operation: text("operation").notNull(),
  primaryKey: text("primary_key").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => ({
  dedupIdx: uniqueIndex("billing_cdc_processed_events_dedup_idx").on(
    table.sourceLsn, table.txid, table.tableName, table.primaryKey, table.operation,
  ),
}))

export const billingPaymentOrders = pgTable("billing_payment_orders", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => billingAccounts.id),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  providerOrderId: text("provider_order_id"),
  status: text("status").notNull().default("pending"),
  amountMicros: bigint("amount_micros", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("CNY"),
  checkoutUrl: text("checkout_url"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Temporary attachments for homepage pre-session uploads
export const tempAttachments = pgTable("temp_attachments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  batchId: text("batch_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  status: text("status").notNull().default("pending"), // pending | consumed | expired
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
