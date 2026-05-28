import type { ProxyConfig } from "./service"
import { logger } from "../server/logger"
import type { Agent, Command } from "@opencode-ai/sdk/v2"

/**
 * Lazy-loading cache for opencode agent and command configuration.
 *
 * On first access, fetches from opencode and caches the result in memory.
 * Subsequent accesses return the cached data without forwarding to opencode.
 * If the initial fetch fails, the cache stays empty and returns empty arrays.
 *
 * The cache is global (not per-workspace) because built-in agents and commands
 * are determined by opencode's own configuration, not workspace state.
 */

interface AgentCommandCache {
  agents: Agent[] | null
  commands: Command[] | null
  fetchPromise: Promise<void> | null
  fetchError: Error | null
}

const cache: AgentCommandCache = {
  agents: null,
  commands: null,
  fetchPromise: null,
  fetchError: null,
}

async function fetchFromOpencode(
  config: ProxyConfig,
  path: string,
): Promise<Response> {
  const url = new URL(path, config.opencodeUrl)
  const headers = new Headers()
  headers.set("Authorization", `Basic ${config.basicAuth}`)

  logger.info({ url: url.toString() }, "AgentCommandCache: fetching from opencode")
  try {
    const res = await fetch(url.toString(), { method: "GET", headers })
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>")
      logger.warn(
        { status: res.status, body: body.slice(0, 200), path },
        "AgentCommandCache: opencode returned non-OK",
      )
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return res
  } catch (err) {
    logger.error({ err, path }, "AgentCommandCache: fetch failed")
    throw err
  }
}

async function ensureLoaded(config: ProxyConfig): Promise<void> {
  // Already loaded successfully
  if (cache.agents !== null && cache.commands !== null) return

  // Already loading — wait for the existing promise
  if (cache.fetchPromise) {
    await cache.fetchPromise
    return
  }

  // Start a new fetch
  cache.fetchPromise = (async () => {
    try {
      const [agentsRes, commandsRes] = await Promise.all([
        fetchFromOpencode(config, "/agent"),
        fetchFromOpencode(config, "/command"),
      ])

      cache.agents = (await agentsRes.json()) as Agent[]
      cache.commands = (await commandsRes.json()) as Command[]

      logger.info(
        { agents: cache.agents.length, commands: cache.commands.length },
        "AgentCommandCache: loaded from opencode",
      )
    } catch (err) {
      cache.fetchError = err as Error
      logger.error({ err }, "AgentCommandCache: failed to load, serving empty lists")
    } finally {
      cache.fetchPromise = null
    }
  })()

  await cache.fetchPromise
}

export function getAgents(config: ProxyConfig): Agent[] {
  // Return cached data synchronously (may be empty if not yet loaded or fetch failed)
  return cache.agents ?? []
}

export function getCommands(config: ProxyConfig): Command[] {
  return cache.commands ?? []
}

/**
 * Trigger a background fetch and wait for it.
 * Returns the loaded agents and commands.
 * If fetch fails, returns empty arrays (never throws).
 */
export async function loadAgentCommandConfig(
  config: ProxyConfig,
): Promise<{ agents: Agent[]; commands: Command[] }> {
  try {
    await ensureLoaded(config)
  } catch {
    // ensureLoaded should handle errors internally, but just in case
  }
  return { agents: getAgents(config), commands: getCommands(config) }
}

/**
 * Reset the cache (for testing purposes).
 */
export function resetAgentCommandCache(): void {
  cache.agents = null
  cache.commands = null
  cache.fetchPromise = null
  cache.fetchError = null
}
