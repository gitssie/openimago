import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"
import { jsonResult } from "../../lib/tool-result.js"

/**
 * creates the `imago_generate_image` tool.
 *
 * Generates an image via the Effect IOC media service chain:
 *   MediaGenerationService → MediaProviderRouter → MediaProvider
 *
 * Provider selection goes through the router, not if/else inside the tool.
 */
export function createGenerateImageTool(): ToolDefinition {
  return tool({
    description:
      "Generate an AI image from a text prompt using the configured media provider",
    args: {
      prompt: tool.schema.string().describe("Image description / prompt"),
      model: tool.schema
        .string()
        .optional()
        .default("mock-image-model")
        .describe("Model to use for generation"),
      provider: tool.schema
        .string()
        .optional()
        .describe(
          "Explicit provider override (placeholder for future provider routing)",
        ),
      aspectRatio: tool.schema
        .enum(["1:1", "16:9", "9:16", "4:3", "3:4"] as const)
        .optional()
        .default("1:1")
        .describe("Image aspect ratio"),
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
        return yield* svc.generateImage({
          model: args.model ?? "mock-image-model",
          prompt: args.prompt,
          sessionId: args.sessionId,
          directory: args.directory,
        })
      }).pipe(Effect.provide(mediaDefaultLayer))

      const result = await Effect.runPromise(effect)

      return jsonResult(
        {
          kind: "image",
          url: result.url,
          provider: (result.metadata as Record<string, unknown>)?.provider,
          model: (result.metadata as Record<string, unknown>)?.model,
          ...(args.outputName ? { outputName: args.outputName } : {}),
          aspectRatio: args.aspectRatio,
        },
        `Image generated — ${args.prompt.slice(0, 50)}${args.prompt.length > 50 ? "…" : ""}`,
      ).output
    },
  })
}
