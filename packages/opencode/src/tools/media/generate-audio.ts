import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import {
  WorkspaceFilesClient,
  buildMediaToolOutput,
} from "../../lib/media/workspace-files.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"

/**
 * creates the `audio_generate` tool.
 *
 * Generates audio (TTS) via the Effect IOC media service chain, registers the
 * result as a workspace file, and returns a contract-compliant
 * MediaToolOutputV1 (see docs/integration/media-tool-integration-contract.md)
 * as `state.output` so the openimago frontend renders an inline media card.
 *
 * The tool name uses the `audio_*` prefix the frontend detects.
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
    async execute(args, ctx) {
      const sessionId = args.sessionId ?? ctx.sessionID
      const model = args.model ?? "mock-audio-model"

      const effect = Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        const result = yield* svc.generateAudio({
          model,
          text: args.prompt,
          voiceId: args.voiceId,
          outputFormat: args.outputFormat,
          sessionId,
          directory: args.directory ?? ctx.directory,
        })

        const meta = (result.metadata ?? {}) as Record<string, unknown>
        const provider = meta.provider as string | undefined
        const mime = (meta.mime as string | undefined) ?? "audio/mpeg"

        const client = yield* WorkspaceFilesClient
        const registered = yield* client.register({
          sessionId,
          kind: "audio",
          mime,
          accessPreviewHref: result.url,
          ...(args.outputName ? { filename: args.outputName } : {}),
          ...(typeof meta.duration === "number" ? { duration: meta.duration } : {}),
          prompt: args.prompt,
          ...(provider ? { provider } : {}),
          model,
          metadata: {
            outputFormat: args.outputFormat,
            ...(args.voiceId ? { voiceId: args.voiceId } : {}),
          },
        })

        return buildMediaToolOutput({
          kind: "audio",
          registered,
          prompt: args.prompt,
          provider,
          model,
        })
      }).pipe(Effect.provide(mediaDefaultLayer))

      const output = await Effect.runPromise(effect)
      return JSON.stringify(output)
    },
  })
}
