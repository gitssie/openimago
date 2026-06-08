import type { ToolDefinition } from "@opencode-ai/plugin"
import { createImagoStatusTool } from "./diagnostics/imago-status.js"
import { createGenerateImageTool } from "./media/generate-image.js"
import { createGenerateVideoTool } from "./media/generate-video.js"
import { createGenerateAudioTool } from "./media/generate-audio.js"

/**
 * Central tool registry for the OpenImago plugin.
 *
 * Returns a map of tool name → ToolDefinition for all tools
 * that the OpenImago OpenCode plugin exposes.  Add new tools
 * here when they are ready — the plugin entry picks them up
 * automatically.
 *
 * Naming convention: imago_<domain>_<action>
 *   - imago_status           — diagnostic/workspace info
 *   - imago_generate_image   — image generation
 *   - imago_generate_video   — video generation
 *   - imago_generate_audio   — audio/TTS generation
 */
export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    /** Diagnostic tool — reports workspace context and plugin health */
    imago_status: createImagoStatusTool(),

    /** Image generation tool — text-to-image via Effect IOC media chain */
    imago_generate_image: createGenerateImageTool(),

    /** Video generation tool — text-to-video via Effect IOC media chain */
    imago_generate_video: createGenerateVideoTool(),

    /** Audio generation tool — text-to-speech via Effect IOC media chain */
    imago_generate_audio: createGenerateAudioTool(),
  }
}
