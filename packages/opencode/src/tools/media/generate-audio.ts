import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"
import { jsonResult } from "../../lib/tool-result.js"

/**
 * creates the `imago_generate_audio` tool.
 *
 * Generates audio (TTS) via the Effect IOC media service chain:
 *   MediaGenerationService → MediaProviderRouter → MediaProvider
 *
 * Provider selection goes through the router, not if/else inside the tool.
 */
export function createGenerateAudioTool(): ToolDefinition {
  return tool({
    description:
      "Generate audio (text-to-speech) from text using the configured media provider",
    args: {
      prompt: tool.schema.string().describe("Text to convert to speech"),
      model: tool.schema
        .string()
        .optional()
        .default("mock-audio-model")
        .describe("Model to use for generation"),
      voiceId: tool.schema
        .string()
        .optional()
        .describe("Voice ID for TTS (provider-specific)"),
      outputFormat: tool.schema
        .string()
        .optional()
        .default("mp3")
        .describe("Output audio format (e.g. mp3, wav)"),
      outputName: tool.schema
        .string()
        .optional()
        .describe("Optional output filename prefix"),
      sessionId: tool.schema
        .string()
        .optional()
        .describe("Session ID for billing context"),
      directory: tool.schema
        .string()
        .optional()
        .describe("Workspace directory for billing context"),
    },
    async execute(args) {
      const effect = Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        return yield* svc.generateAudio({
          model: args.model ?? "mock-audio-model",
          text: args.prompt,
          voiceId: args.voiceId,
          outputFormat: args.outputFormat,
          sessionId: args.sessionId,
          directory: args.directory,
        })
      }).pipe(Effect.provide(mediaDefaultLayer))

      const result = await Effect.runPromise(effect)

      return jsonResult(
        {
          kind: "audio",
          url: result.url,
          provider: (result.metadata as Record<string, unknown>)?.provider,
          model: (result.metadata as Record<string, unknown>)?.model,
          ...(args.outputName ? { outputName: args.outputName } : {}),
          ...(args.voiceId ? { voiceId: args.voiceId } : {}),
          outputFormat: args.outputFormat,
        },
        `Audio generated — ${args.prompt.slice(0, 50)}${args.prompt.length > 50 ? "…" : ""}`,
      ).output
    },
  })
}
