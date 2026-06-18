import { Hono } from "hono"
import { authMiddleware } from "../server/middleware"
import { storyService } from "./story-service"

export const storyRoutes = new Hono()

storyRoutes.use("/*", authMiddleware)

// GET /api/platform/projects/:id/story/manifest
storyRoutes.get("/:id/story/manifest", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const result = await storyService.getManifest(projectId, userId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ manifest: result.data })
})

// GET /api/platform/projects/:id/story/bible
storyRoutes.get("/:id/story/bible", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const result = await storyService.getBible(projectId, userId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ bible: result.data })
})

// GET /api/platform/projects/:id/story/series
storyRoutes.get("/:id/story/series", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const result = await storyService.getSeries(projectId, userId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ series: result.data })
})

// GET /api/platform/projects/:id/story/episodes/:epId
storyRoutes.get("/:id/story/episodes/:epId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const result = await storyService.getEpisode(projectId, userId, episodeId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ episode: result.data })
})

// POST /api/platform/projects/:id/story/episodes/:epId/shots
// Append a new (empty, pending) shot to the episode (ADR 0005, optimistic
// concurrency via optional expectedUpdatedAt in the body).
storyRoutes.post("/:id/story/episodes/:epId/shots", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")

  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { expectedUpdatedAt?: unknown }
    if (typeof body?.expectedUpdatedAt === "string") {
      expectedUpdatedAt = body.expectedUpdatedAt
    }
  } catch {
    // No / empty body — proceed without the concurrency guard.
  }

  const result = await storyService.addShot(projectId, userId, episodeId, expectedUpdatedAt)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ shot: result.data.shot, updatedAt: result.data.updatedAt }, 201)
})

// POST /api/platform/projects/:id/story/episodes/:epId/shots/:shotId/generate
// Mock generation command (ADR 0005): synchronously append a completed Run to
// runs.json (picsum result) and mark the shot generated. No real provider yet.
storyRoutes.post("/:id/story/episodes/:epId/shots/:shotId/generate", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const shotId = c.req.param("shotId")

  const result = await storyService.generateShot(projectId, userId, episodeId, shotId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ run: result.data.run }, 201)
})

// POST /api/platform/projects/:id/story/episodes/:epId/shots/:shotId/voiceover
// Mock TTS (ADR 0004): append one completed audio Run per dialog line of the
// shot. Derived state — never writes cut.json or episode.json.
storyRoutes.post("/:id/story/episodes/:epId/shots/:shotId/voiceover", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const shotId = c.req.param("shotId")

  const result = await storyService.generateVoiceover(projectId, userId, episodeId, shotId)
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ runs: result.data.runs }, 201)
})

// POST /api/platform/projects/:id/story/episodes/:epId/voiceover
// Episode-wide voiceover: append audio Runs for every shot's dialog.
storyRoutes.post("/:id/story/episodes/:epId/voiceover", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")

  const result = await storyService.generateVoiceover(projectId, userId, episodeId)
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ runs: result.data.runs }, 201)
})

// PATCH /api/platform/projects/:id/story/episodes/:epId/shots/reorder
// Reorder shots (ADR 0005). Registered BEFORE the :shotId PATCH so the static
// "reorder" segment is not parsed as a shot id.
storyRoutes.patch("/:id/story/episodes/:epId/shots/reorder", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")

  let orderedShotIds: string[] = []
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { orderedShotIds?: unknown; expectedUpdatedAt?: unknown }
    if (Array.isArray(body?.orderedShotIds)) {
      orderedShotIds = body.orderedShotIds.filter((x): x is string => typeof x === "string")
    }
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — orderedShotIds stays empty → reorderShots returns 400.
  }

  const result = await storyService.reorderShots(projectId, userId, episodeId, orderedShotIds, expectedUpdatedAt)
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ updatedAt: result.data.updatedAt })
})

// DELETE /api/platform/projects/:id/story/episodes/:epId/shots/:shotId
// Delete a shot, renumber the rest (ADR 0005, optimistic concurrency).
storyRoutes.delete("/:id/story/episodes/:epId/shots/:shotId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const shotId = c.req.param("shotId")

  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { expectedUpdatedAt?: unknown }
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // No / empty body — proceed without the concurrency guard.
  }

  const result = await storyService.deleteShot(projectId, userId, episodeId, shotId, expectedUpdatedAt)
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ updatedAt: result.data.updatedAt })
})

// PATCH /api/platform/projects/:id/story/episodes/:epId/shots/:shotId
// Update whitelisted shot fields (ADR 0005, optimistic concurrency).
storyRoutes.patch("/:id/story/episodes/:epId/shots/:shotId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const shotId = c.req.param("shotId")

  let patch: Record<string, unknown> = {}
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as Record<string, unknown>
    if (body && typeof body === "object") {
      patch = body
      if (typeof body.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
    }
  } catch {
    // Empty body — no fields to apply (updateShot will still no-op-write).
  }

  const result = await storyService.updateShot(projectId, userId, episodeId, shotId, patch, expectedUpdatedAt)
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ shot: result.data.shot, updatedAt: result.data.updatedAt })
})

// ── Episode Cut (ADR 0006 — edit layer) ─────────────────────────────────────
//
// Reads/writes story/cuts/ep_NNN.cut.json, a file separate from episode.json so
// the edit layer (timeline) and generation layer (script) have independent
// optimistic-concurrency clocks. All write ops carry an optional
// expectedUpdatedAt and return 409 on a stale write.

/** Parse an optional expectedUpdatedAt from a JSON body, tolerating no body. */
async function readExpectedUpdatedAt(c: any): Promise<string | undefined> {
  try {
    const body = (await c.req.json()) as { expectedUpdatedAt?: unknown }
    if (typeof body?.expectedUpdatedAt === "string") return body.expectedUpdatedAt
  } catch {
    // No / empty body — proceed without the concurrency guard.
  }
  return undefined
}

// GET /api/platform/projects/:id/story/episodes/:epId/cut
storyRoutes.get("/:id/story/episodes/:epId/cut", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const result = await storyService.getEpisodeCut(projectId, userId, episodeId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }
  return c.json({ cut: result.data })
})

// POST /api/platform/projects/:id/story/episodes/:epId/cut/assemble
// Agent-authored rough cut (ADR 0006): build one clip per shot with completed
// video/image media, ordered by shotNumber. Optional expectedUpdatedAt (409).
storyRoutes.post("/:id/story/episodes/:epId/cut/assemble", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const expectedUpdatedAt = await readExpectedUpdatedAt(c)

  const result = await storyService.assembleEpisodeCut(projectId, userId, episodeId, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt, cut: { clips: result.data.clips } })
})

// PATCH /api/platform/projects/:id/story/episodes/:epId/cut/clips/reorder
// Registered BEFORE /clips/:clipId so "reorder" is not parsed as a clip id.
storyRoutes.patch("/:id/story/episodes/:epId/cut/clips/reorder", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")

  let orderedClipIds: string[] = []
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { orderedClipIds?: unknown; expectedUpdatedAt?: unknown }
    if (Array.isArray(body?.orderedClipIds)) {
      orderedClipIds = body.orderedClipIds.filter((x): x is string => typeof x === "string")
    }
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — orderedClipIds stays empty → reorderClips returns 400.
  }

  const result = await storyService.reorderClips(projectId, userId, episodeId, orderedClipIds, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// POST /api/platform/projects/:id/story/episodes/:epId/cut/clips/:clipId/split
storyRoutes.post("/:id/story/episodes/:epId/cut/clips/:clipId/split", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const clipId = c.req.param("clipId")

  let atSeconds = Number.NaN
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { atSeconds?: unknown; expectedUpdatedAt?: unknown }
    if (typeof body?.atSeconds === "number") atSeconds = body.atSeconds
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — atSeconds stays NaN → splitClip returns 400.
  }

  const result = await storyService.splitClip(projectId, userId, episodeId, clipId, atSeconds, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt, newClipId: result.data.newClipId })
})

// PATCH /api/platform/projects/:id/story/episodes/:epId/cut/clips/:clipId
// Trim a clip's in/out points.
storyRoutes.patch("/:id/story/episodes/:epId/cut/clips/:clipId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const clipId = c.req.param("clipId")

  let inPoint = Number.NaN
  let outPoint = Number.NaN
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { inPoint?: unknown; outPoint?: unknown; expectedUpdatedAt?: unknown }
    if (typeof body?.inPoint === "number") inPoint = body.inPoint
    if (typeof body?.outPoint === "number") outPoint = body.outPoint
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — bounds stay NaN → trimClip returns 400.
  }

  const result = await storyService.trimClip(projectId, userId, episodeId, clipId, inPoint, outPoint, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// DELETE /api/platform/projects/:id/story/episodes/:epId/cut/clips/:clipId
storyRoutes.delete("/:id/story/episodes/:epId/cut/clips/:clipId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const clipId = c.req.param("clipId")
  const expectedUpdatedAt = await readExpectedUpdatedAt(c)

  const result = await storyService.deleteClip(projectId, userId, episodeId, clipId, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// PUT /api/platform/projects/:id/story/episodes/:epId/cut/transitions/:afterClipId
storyRoutes.put("/:id/story/episodes/:epId/cut/transitions/:afterClipId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const afterClipId = c.req.param("afterClipId")

  let kind = ""
  let durationSeconds = Number.NaN
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as { kind?: unknown; durationSeconds?: unknown; expectedUpdatedAt?: unknown }
    if (typeof body?.kind === "string") kind = body.kind
    if (typeof body?.durationSeconds === "number") durationSeconds = body.durationSeconds
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — kind stays "" → setTransition returns 400.
  }

  const result = await storyService.setTransition(
    projectId,
    userId,
    episodeId,
    afterClipId,
    kind,
    durationSeconds,
    expectedUpdatedAt,
  )
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// DELETE /api/platform/projects/:id/story/episodes/:epId/cut/transitions/:afterClipId
storyRoutes.delete("/:id/story/episodes/:epId/cut/transitions/:afterClipId", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const afterClipId = c.req.param("afterClipId")
  const expectedUpdatedAt = await readExpectedUpdatedAt(c)

  const result = await storyService.clearTransition(projectId, userId, episodeId, afterClipId, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// PUT /api/platform/projects/:id/story/episodes/:epId/cut/bgm
storyRoutes.put("/:id/story/episodes/:epId/cut/bgm", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")

  let artifactId = ""
  let gainDb: number | undefined
  let inPoint: number | undefined
  let outPoint: number | undefined
  let expectedUpdatedAt: string | undefined
  try {
    const body = (await c.req.json()) as {
      artifactId?: unknown
      gainDb?: unknown
      inPoint?: unknown
      outPoint?: unknown
      expectedUpdatedAt?: unknown
    }
    if (typeof body?.artifactId === "string") artifactId = body.artifactId
    if (typeof body?.gainDb === "number") gainDb = body.gainDb
    if (typeof body?.inPoint === "number") inPoint = body.inPoint
    if (typeof body?.outPoint === "number") outPoint = body.outPoint
    if (typeof body?.expectedUpdatedAt === "string") expectedUpdatedAt = body.expectedUpdatedAt
  } catch {
    // Empty/invalid body — artifactId stays "" → setBgm returns 400.
  }

  const result = await storyService.setBgm(
    projectId,
    userId,
    episodeId,
    { artifactId, gainDb, inPoint, outPoint },
    expectedUpdatedAt,
  )
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// DELETE /api/platform/projects/:id/story/episodes/:epId/cut/bgm
storyRoutes.delete("/:id/story/episodes/:epId/cut/bgm", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const expectedUpdatedAt = await readExpectedUpdatedAt(c)

  const result = await storyService.clearBgm(projectId, userId, episodeId, expectedUpdatedAt)
  if ("error" in result) return c.json({ error: result.error }, result.status as any)
  return c.json({ updatedAt: result.data.updatedAt })
})

// GET /api/platform/projects/:id/story/episodes/:epId/workflow
storyRoutes.get("/:id/story/episodes/:epId/workflow", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const result = await storyService.getEpisodeWorkflow(projectId, userId, episodeId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ workflow: result.data })
})

// GET /api/platform/projects/:id/story/episodes/:epId/runs
storyRoutes.get("/:id/story/episodes/:epId/runs", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const episodeId = c.req.param("epId")
  const result = await storyService.getEpisodeRuns(projectId, userId, episodeId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  return c.json({ runs: result.data })
})

// GET /api/platform/projects/:id/story/agents
storyRoutes.get("/:id/story/agents", async (c) => {
  const userId = c.get("userId") as string
  const projectId = c.req.param("id")
  const result = await storyService.getAgents(projectId, userId)

  if ("error" in result) {
    return c.json({ error: result.error }, result.status as any)
  }

  // Return as text/plain since AGENTS.md is markdown, not JSON
  return c.text(result.text)
})
