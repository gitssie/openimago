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
  /**
   * Tool-call input arguments persisted as generation-run provenance. The
   * backend stores these under metadata.genRun.inputArgs (workspace-files
   * service), which validate_story reads to detect orphan artifacts (media
   * generated for a shot/node but never referenced by a run).
   */
  inputArgs?: Record<string, unknown>
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

// ── Fallback (graceful degradation) ─────────────────────────────────────────

/** Generate a non-persistent fallback workspace-file id (`mock_<random>`). */
export function generateFallbackWorkspaceFileId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `mock_${rand}`
}

/**
 * Build a degraded `RegisteredWorkspaceFile` from the generation input when the
 * backend registration is unavailable (missing env / backend unreachable).
 *
 * The media still renders in chat via the provider's loadable preview URL, but
 * it is NOT persisted — the durable workspaceFileId is a `mock_` placeholder,
 * so the right-side panel / project outputs will not list it until a real
 * registration succeeds.
 */
export function buildFallbackRegisteredFile(
  input: RegisterWorkspaceFileInput,
): RegisteredWorkspaceFile {
  return {
    workspaceFileId: generateFallbackWorkspaceFileId(),
    access: { preview: { href: input.accessPreviewHref } },
    mime: input.mime,
    ...(input.filename !== undefined ? { filename: input.filename } : {}),
    ...(input.width !== undefined ? { width: input.width } : {}),
    ...(input.height !== undefined ? { height: input.height } : {}),
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  }
}

/**
 * Register a workspace file, gracefully degrading on failure.
 *
 * On registration error (missing env / backend unreachable) this logs a
 * warning and resolves with a non-persistent `mock_` fallback so the media
 * card still renders in chat instead of failing the whole session. The
 * returned Effect therefore never fails.
 */
export function registerOrFallback(
  client: WorkspaceFilesClientInterface,
  input: RegisterWorkspaceFileInput,
): Effect.Effect<RegisteredWorkspaceFile> {
  return client.register(input).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(
          `workspace-files registration failed; degrading to non-persistent mock id: ${error.message}`,
        )
        return buildFallbackRegisteredFile(input)
      }),
    ),
  )
}

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
