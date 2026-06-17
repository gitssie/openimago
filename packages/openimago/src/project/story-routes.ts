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
