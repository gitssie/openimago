import type { ToolDefinition } from "@opencode-ai/plugin"
import { createImagoStatusTool } from "./diagnostics/imago-status.js"
import { createValidateStoryTool } from "./diagnostics/validate-story.js"
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
 * Naming convention:
 *   - Diagnostics use the imago_<domain>_<action> convention.
 *   - Media tools use the contract media prefixes (image_* / video_* / audio_*)
 *     that the openimago frontend detects to render inline media cards. See
 *     docs/integration/media-tool-integration-contract.md and ADR 0002.
 *       - imago_status     — diagnostic/workspace info
 *       - image_generate   — image generation
 *       - video_generate   — video generation
 *       - audio_generate   — audio/TTS generation
 */
export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    /** Diagnostic tool — reports workspace context and plugin health */
    imago_status: createImagoStatusTool(),

    /** Story-graph validator — a "typecheck" for bible/series/episodes/workflow/runs */
    validate_story: createValidateStoryTool(),

    /** Image generation tool — text-to-image via Effect IOC media chain */
    image_generate: createGenerateImageTool(),

    /** Video generation tool — text-to-video via Effect IOC media chain */
    video_generate: createGenerateVideoTool(),

    /** Audio generation tool — text-to-speech via Effect IOC media chain */
    audio_generate: createGenerateAudioTool(),
  }
}
