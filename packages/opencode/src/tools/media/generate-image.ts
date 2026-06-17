import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { Effect } from "effect"
import { MediaGenerationService } from "../../lib/media/service.js"
import {
  WorkspaceFilesClient,
  buildMediaToolOutput,
  registerOrFallback,
} from "../../lib/media/workspace-files.js"
import { mediaDefaultLayer } from "../../lib/media/layer.js"

/**
 * creates the `image_generate` tool.
 *
 * Generates an image via the Effect IOC media service chain, registers the
 * result as a workspace file, and returns a contract-compliant
 * MediaToolOutputV1 (see docs/integration/media-tool-integration-contract.md)
 * as `state.output` so the openimago frontend renders an inline media card.
 *
 * The tool name uses the `image_*` prefix the frontend detects.
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
    async execute(args, ctx) {
      const sessionId = args.sessionId ?? ctx.sessionID
      const model = args.model ?? "mock-image-model"

      const effect = Effect.gen(function* () {
        const svc = yield* MediaGenerationService
        const result = yield* svc.generateImage({
          model,
          prompt: args.prompt,
          sessionId,
          directory: args.directory ?? ctx.directory,
        })

        const meta = (result.metadata ?? {}) as Record<string, unknown>
        const provider = meta.provider as string | undefined
        const mime = (meta.mime as string | undefined) ?? "image/jpeg"

        const client = yield* WorkspaceFilesClient
        const registered = yield* registerOrFallback(client, {
          sessionId,
          kind: "image",
          mime,
          accessPreviewHref: result.url,
          ...(args.outputName ? { filename: args.outputName } : {}),
          ...(typeof meta.width === "number" ? { width: meta.width } : {}),
          ...(typeof meta.height === "number" ? { height: meta.height } : {}),
          prompt: args.prompt,
          ...(provider ? { provider } : {}),
          model,
          metadata: { aspectRatio: args.aspectRatio },
        })

        return buildMediaToolOutput({
          kind: "image",
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
