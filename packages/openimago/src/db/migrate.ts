import { sql } from "drizzle-orm"
import { db } from "./client"

export async function migrate() {
  // ── OpenCode-owned tables referenced by openimago ──────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workspace (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      branch TEXT,
      directory TEXT,
      extra JSONB,
      project_id TEXT NOT NULL,
      time_used BIGINT NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT,
      email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_auths (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      provider_id TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_auths_user_provider_idx
    ON user_auths (user_id, provider)
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      directory TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id TEXT
  `)

  // Rename full_path → directory on projects table (same concept, unified naming)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'full_path'
      ) THEN
        ALTER TABLE projects RENAME COLUMN full_path TO directory;
      END IF;
    END$$
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace') THEN
        ALTER TABLE workspace ADD COLUMN IF NOT EXISTS user_id TEXT;
      END IF;
    END$$
  `)

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace') THEN
        ALTER TABLE workspace ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      END IF;
    END$$
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      duration REAL,
      thumbnail_path TEXT,
      storage_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS workspace_generated_files (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workspace_id TEXT,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      filename TEXT,
      width INTEGER,
      height INTEGER,
      duration REAL,
      access_locators JSONB NOT NULL,
      prompt TEXT,
      provider TEXT,
      model TEXT,
      metadata JSONB,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Ensure workspace_id is nullable (previous schema may have had NOT NULL)
  await db.execute(sql`
    ALTER TABLE workspace_generated_files ALTER COLUMN workspace_id DROP NOT NULL
  `)

  // ── Billing ────────────────────────────────────────────────────

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_accounts (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      balance_micros BIGINT NOT NULL DEFAULT 0,
      minimum_balance_micros BIGINT NOT NULL DEFAULT 0,
      credit_limit_micros BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_owner_idx
    ON billing_accounts (owner_type, owner_id)
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES billing_accounts(id),
      user_id TEXT NOT NULL,
      workspace_id TEXT,
      project_id TEXT,
      session_id TEXT,
      entry_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT,
      model TEXT,
      tool_name TEXT,
      media_kind TEXT,
      quantity INTEGER,
      unit TEXT,
      amount_micros BIGINT NOT NULL,
      balance_after_micros BIGINT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      pricing_snapshot JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_cdc_processed_events (
      id TEXT PRIMARY KEY,
      source_lsn TEXT NOT NULL,
      txid TEXT NOT NULL,
      table_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      primary_key TEXT NOT NULL,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB
    )
  `)

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_cdc_processed_events_dedup_idx
    ON billing_cdc_processed_events (source_lsn, txid, table_name, primary_key, operation)
  `)

  // ── Gallery ──────────────────────────────────────────────────────

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS gallery_works (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT[],
      prompt TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      image_key TEXT NOT NULL,
      thumbnail_key TEXT,
      image_url TEXT,
      thumbnail_url TEXT,
      mime TEXT,
      width INTEGER,
      height INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gallery_category ON gallery_works (category)
  `)

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gallery_sort ON gallery_works (sort_order ASC, published_at DESC)
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS billing_payment_orders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES billing_accounts(id),
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      provider_order_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      amount_micros BIGINT NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY',
      checkout_url TEXT,
      paid_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // ── Temporary attachments (homepage pre-session uploads) ──────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS temp_attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      batch_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

export async function truncate() {
  // Billing: delete children before parents (FK-safe order)
  await db.execute(sql`DELETE FROM billing_ledger`)
  await db.execute(sql`DELETE FROM billing_cdc_processed_events`)
  await db.execute(sql`DELETE FROM billing_payment_orders`)
  await db.execute(sql`DELETE FROM billing_accounts`)

  await db.execute(sql`DELETE FROM workspace_generated_files`)
  await db.execute(sql`DELETE FROM assets`)
  await db.execute(sql`DELETE FROM temp_attachments`)
  await db.execute(sql`DELETE FROM prompt_templates`)
  await db.execute(sql`DELETE FROM gallery_works`)

  // OpenCode-owned tables — only truncate if they exist
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_refs') THEN
        DELETE FROM workspace_refs;
      END IF;
    END$$
  `)
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace') THEN
        DELETE FROM workspace;
      END IF;
    END$$
  `)

  await db.execute(sql`DELETE FROM projects`)
  await db.execute(sql`DELETE FROM user_auths`)
  await db.execute(sql`DELETE FROM users`)
}
