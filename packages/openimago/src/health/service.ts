import type { DB } from "../db/client"
import { sql } from "drizzle-orm"
import { normalizeUpstreamUrl } from "../proxy/service"

const startTime = Date.now()

export async function healthCheck(opts?: {
  db: DB
  opencodeUrl?: string
}) {
  const db = opts?.db!
  const rawOpencodeUrl =
    opts?.opencodeUrl ?? process.env.OPENCODE_URL ?? "http://localhost:3000"
  // Normalize 0.0.0.0 → 127.0.0.1 so the health probe can actually connect
  // (Bun's fetch cannot reach the 0.0.0.0 bind address). Shared with the proxy.
  const opencodeUrl = normalizeUpstreamUrl(rawOpencodeUrl)

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
