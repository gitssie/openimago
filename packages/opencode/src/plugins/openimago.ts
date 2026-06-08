import type { Plugin } from "@opencode-ai/plugin"
import { createToolRegistry } from "../tools/registry.js"

/**
 * OpenImago Plugin — main OpenCode plugin entry point.
 *
 * Registers all OpenImago tools via the central tool registry.
 * Each tool is defined in its domain directory under src/tools/.
 *
 * Architecture:
 *   plugins/openimago.ts  →  tools/registry.ts  →  tools/<domain>/*.ts
 *                                                   lib/media/*.ts (Effect IOC)
 *                                                   lib/config.ts
 *                                                   lib/tool-result.ts
 */
export const OpenImagoPlugin: Plugin = async () => {
  return {
    tool: createToolRegistry(),
  }
}

export default OpenImagoPlugin
