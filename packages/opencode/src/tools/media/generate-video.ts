import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import {
  WorkspaceFilesClient,
  buildMediaToolOutput,
} from "../../lib/media/workspace-files.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"

/**
 * creates the `video_generate` tool.
 *
 * Generates a video via the Effect IOC media service chain, registers the
 * result as a workspace file, and returns a contract-compliant
 * MediaToolOutputV1 (see docs/integration/media-tool-integration-contract.md)
 * as `state.output` so the openimago frontend renders an inline media card.
 *
 * The tool name uses the `video_*` prefix the frontend detects.
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
    async execute(args, ctx) {
      const sessionId = args.sessionId ?? ctx.sessionID
      const model = args.model ?? "mock-video-model"

      const effect = Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        const result = yield* svc.generateVideo({
          model,
          prompt: args.prompt,
          sessionId,
          directory: args.directory ?? ctx.directory,
        })

        const meta = (result.metadata ?? {}) as Record<string, unknown>
        const provider = meta.provider as string | undefined
        const mime = (meta.mime as string | undefined) ?? "video/mp4"

        const client = yield* WorkspaceFilesClient
        const registered = yield* client.register({
          sessionId,
          kind: "video",
          mime,
          accessPreviewHref: result.url,
          ...(args.outputName ? { filename: args.outputName } : {}),
          ...(typeof meta.duration === "number"
            ? { duration: meta.duration }
            : { duration: args.durationSeconds }),
          prompt: args.prompt,
          ...(provider ? { provider } : {}),
          model,
          metadata: { aspectRatio: args.aspectRatio },
        })

        return buildMediaToolOutput({
          kind: "video",
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
