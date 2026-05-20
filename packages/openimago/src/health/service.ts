import type { DB } from "../db/client"
import { sql } from "drizzle-orm"

const startTime = Date.now()

export async function healthCheck(opts?: {
  db: DB
  opencodeUrl?: string
}) {
  const db = opts?.db!
  const opencodeUrl = opts?.opencodeUrl ?? process.env.OPENCODE_URL ?? "http://localhost:3000"

  let dbStatus: "connected" | "disconnected" = "disconnected"
  let opencodeStatus: "connected" | "disconnected" = "disconnected"

  try {
    await db.execute(sql`SELECT 1`)
    dbStatus = "connected"
  } catch {
    dbStatus = "disconnected"
  }

  try {
    const resp = await fetch(`${opencodeUrl}/global/health`, { signal: AbortSignal.timeout(3000) })
    opencodeStatus = resp.ok ? "connected" : "disconnected"
  } catch {
    opencodeStatus = "disconnected"
  }

  const uptime = Math.floor((Date.now() - startTime) / 1000)

  return {
    status: "ok" as const,
    opencode: opencodeStatus,
    db: dbStatus,
    uptime,
  }
}
