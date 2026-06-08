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
