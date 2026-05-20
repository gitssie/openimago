import { sql } from "drizzle-orm"
import { db } from "./client"

export async function migrate() {
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
      full_path TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS work_dirs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT REFERENCES projects(id),
      type TEXT NOT NULL,
      full_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await db.execute(sql`
    ALTER TABLE work_dirs DROP CONSTRAINT IF EXISTS work_dirs_full_path_key
  `)

  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id TEXT
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
}

export async function truncate() {
  await db.execute(sql`DELETE FROM assets`)
  await db.execute(sql`DELETE FROM prompt_templates`)
  await db.execute(sql`DELETE FROM work_dirs`)
  await db.execute(sql`DELETE FROM projects`)
  await db.execute(sql`DELETE FROM user_auths`)
  await db.execute(sql`DELETE FROM users`)
}
