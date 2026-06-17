import { Context, Effect, Layer } from "effect"
import { MediaConfig } from "./config.js"
import type { MediaKind } from "./provider.js"

// ── Types ──────────────────────────────────────────────────────────────────

/** Browser-loadable access locator (opaque href + optional expiry hint). */
export interface MediaAccessLocator {
  href: string
  expiresAt?: string
}

/** MediaToolOutputV1 result block (per media-tool-integration-contract). */
export interface MediaToolResultV1 {
  workspaceFileId: string
  access: {
    preview: MediaAccessLocator
    download?: MediaAccessLocator
    thumbnail?: MediaAccessLocator
    poster?: MediaAccessLocator
  }
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

/**
 * MediaToolOutputV1 — the contract-compliant output the openimago frontend
 * parses from `ToolPart.state.output` to render inline media cards.
 */
export interface MediaToolOutputV1 {
  version: 1
  kind: MediaKind
  status: "completed"
  result: MediaToolResultV1
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
}

/** Input to register a tool-generated workspace file. */
export interface RegisterWorkspaceFileInput {
  sessionId: string
  kind: MediaKind
  mime: string
  /** Browser-loadable preview URL. For mock resources this is the provider URL. */
  accessPreviewHref: string
  accessDownloadHref?: string
  accessThumbnailHref?: string
  accessPosterHref?: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  prompt?: string
  provider?: string
  model?: string
  metadata?: Record<string, unknown>
}

/** Successful registration result. */
export interface RegisteredWorkspaceFile {
  workspaceFileId: string
  access: MediaToolResultV1["access"]
  mime: string
  filename?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  createdAt?: string
  metadata?: Record<string, unknown>
}

/** Error raised when workspace-file registration fails. */
export class WorkspaceFileRegistrationError extends Error {
  readonly _tag = "WorkspaceFileRegistrationError"
  readonly code?: string
  constructor(message: string, readonly cause?: unknown, code?: string) {
    super(message)
    this.code = code
  }
}

// ── Service interface + Tag ─────────────────────────────────────────────────

export interface WorkspaceFilesClientInterface {
  /**
   * Register a tool-generated workspace file with the openimago backend and
   * return its durable `workspaceFileId` plus access locators.
   */
  readonly register: (
    input: RegisterWorkspaceFileInput,
  ) => Effect.Effect<RegisteredWorkspaceFile, WorkspaceFileRegistrationError>
}

export class WorkspaceFilesClient extends Context.Tag(
  "openimago/WorkspaceFilesClient",
)<WorkspaceFilesClient, WorkspaceFilesClientInterface>() {}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a contract-compliant MediaToolOutputV1 from a registered workspace
 * file and generation context.
 */
export function buildMediaToolOutput(args: {
  kind: MediaKind
  registered: RegisteredWorkspaceFile
  prompt?: string
  provider?: string
  model?: string
}): MediaToolOutputV1 {
  const { kind, registered, prompt, provider, model } = args
  return {
    version: 1,
    kind,
    status: "completed",
    result: {
      workspaceFileId: registered.workspaceFileId,
      access: registered.access,
      mime: registered.mime,
      ...(registered.filename !== undefined ? { filename: registered.filename } : {}),
      ...(registered.width !== undefined ? { width: registered.width } : {}),
      ...(registered.height !== undefined ? { height: registered.height } : {}),
      ...(registered.duration !== undefined ? { duration: registered.duration } : {}),
      ...(registered.seed !== undefined ? { seed: registered.seed } : {}),
      ...(registered.createdAt !== undefined ? { createdAt: registered.createdAt } : {}),
      ...(registered.metadata !== undefined ? { metadata: registered.metadata } : {}),
    },
    ...(prompt !== undefined ? { prompt } : {}),
    ...(provider !== undefined ? { provider } : {}),
    ...(model !== undefined ? { model } : {}),
  }
}

// ── Layer ──────────────────────────────────────────────────────────────────

/**
 * Workspace-files client layer.
 *
 * Requires `MediaConfig`. POSTs to `${backendUrl}/api/platform/workspace-files`
 * with an `x-api-key` service-auth header (OPENIMAGO_BACKEND_API_KEY), matching
 * the backend service-auth channel.
 */
export const layer: Layer.Layer<WorkspaceFilesClient, never, MediaConfig> =
  Layer.effect(
    WorkspaceFilesClient,
    Effect.gen(function* () {
      const config = yield* MediaConfig
      const backendUrl = config.backendUrl
      const apiKey = config.backendApiKey

      const postRegister = async (
        input: RegisterWorkspaceFileInput,
      ): Promise<RegisteredWorkspaceFile> => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (apiKey) {
          headers["x-api-key"] = apiKey
        }

        const response = await fetch(
          `${backendUrl}/api/platform/workspace-files`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(input),
          },
        )

        if (!response.ok) {
          let errorCode: string | undefined
          try {
            const errBody = (await response.json()) as Record<string, unknown>
            errorCode = (errBody.error as Record<string, unknown>)?.code as
              | string
              | undefined
          } catch {
            // ignore parse errors
          }
          const text = await response.text().catch(() => "(no body)")
          throw new WorkspaceFileRegistrationError(
            `Workspace-files registration returned ${response.status}: ${text}`,
            undefined,
            errorCode,
          )
        }

        const data = (await response.json()) as Record<string, unknown>
        const result = data.result as Record<string, unknown> | undefined
        const workspaceFileId =
          (data.workspaceFileId as string | undefined) ??
          (result?.workspaceFileId as string | undefined)

        if (!workspaceFileId) {
          throw new WorkspaceFileRegistrationError(
            "Workspace-files registration response missing workspaceFileId",
          )
        }

        const access = result?.access as MediaToolResultV1["access"] | undefined
        return {
          workspaceFileId,
          access: access ?? { preview: { href: input.accessPreviewHref } },
          mime: (result?.mime as string | undefined) ?? input.mime,
          ...(result?.filename !== undefined
            ? { filename: result.filename as string }
            : input.filename !== undefined
              ? { filename: input.filename }
              : {}),
          ...(result?.width !== undefined
            ? { width: result.width as number }
            : input.width !== undefined
              ? { width: input.width }
              : {}),
          ...(result?.height !== undefined
            ? { height: result.height as number }
            : input.height !== undefined
              ? { height: input.height }
              : {}),
          ...(result?.duration !== undefined
            ? { duration: result.duration as number }
            : input.duration !== undefined
              ? { duration: input.duration }
              : {}),
          ...(result?.seed !== undefined
            ? { seed: result.seed as number }
            : input.seed !== undefined
              ? { seed: input.seed }
              : {}),
          ...(result?.createdAt !== undefined
            ? { createdAt: result.createdAt as string }
            : {}),
          ...(result?.metadata !== undefined
            ? { metadata: result.metadata as Record<string, unknown> }
            : input.metadata !== undefined
              ? { metadata: input.metadata }
              : {}),
        }
      }

      const register: WorkspaceFilesClientInterface["register"] = (input) =>
        Effect.tryPromise({
          try: () => postRegister(input),
          catch: (error) =>
            error instanceof WorkspaceFileRegistrationError
              ? error
              : new WorkspaceFileRegistrationError(
                  `Failed to register workspace file: ${(error as Error).message}`,
                  error,
                ),
        })

      return { register } satisfies WorkspaceFilesClientInterface
    }),
  )
