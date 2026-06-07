import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"
import { jsonResult } from "../../lib/tool-result.js"

/**
 * creates the `imago_generate_video` tool.
 *
 * Generates a video via the Effect IOC media service chain:
 *   MediaGenerationService → MediaProviderRouter → MediaProvider
 *
 * Provider selection goes through the router, not if/else inside the tool.
 */
export function createGenerateVideoTool(): ToolDefinition {
  return tool({
    description:
      "Generate an AI video from a text prompt using the configured media provider",
    args: {
      prompt: tool.schema.string().describe("Video description / prompt"),
      model: tool.schema
        .string()
        .optional()
        .default("mock-video-model")
        .describe("Model to use for generation"),
      provider: tool.schema
        .string()
        .optional()
        .describe(
          "Explicit provider override (placeholder for future provider routing)",
        ),
      durationSeconds: tool.schema
        .number()
        .min(1)
        .max(30)
        .optional()
        .default(5)
        .describe("Video duration in seconds (1-30)"),
      aspectRatio: tool.schema
        .enum(["16:9", "9:16", "1:1"] as const)
        .optional()
        .default("16:9")
        .describe("Video aspect ratio"),
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
        return yield* svc.generateVideo({
          model: args.model ?? "mock-video-model",
          prompt: args.prompt,
          sessionId: args.sessionId,
          directory: args.directory,
        })
      }).pipe(Effect.provide(mediaDefaultLayer))

      const result = await Effect.runPromise(effect)

      return jsonResult(
        {
          kind: "video",
          url: result.url,
          provider: (result.metadata as Record<string, unknown>)?.provider,
          model: (result.metadata as Record<string, unknown>)?.model,
          ...(args.outputName ? { outputName: args.outputName } : {}),
          durationSeconds: args.durationSeconds,
          aspectRatio: args.aspectRatio,
        },
        `Video generated — ${args.prompt.slice(0, 50)}${args.prompt.length > 50 ? "…" : ""}`,
      ).output
    },
  })
}
