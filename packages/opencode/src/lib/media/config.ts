import { Context, Layer } from "effect"

// ── Interface ──────────────────────────────────────────────────────────

/**
 * Injectable media configuration data.
 *
 * Required config must be provided by the runtime environment.
 * Missing required values fail clearly — no hidden hardcoded defaults
 * for critical API keys or endpoints.
 */
export interface MediaConfigData {
  /** OpenImago backend API base URL. */
  readonly backendUrl: string

  /** Optional API key for the backend. */
  readonly backendApiKey?: string

  /**
   * Billing enabled flag.
   *
   * - `false` — billing is explicitly disabled; no charges are reported.
   * - `true` — billing is enabled; requires sessionId + directory per call.
   * - `undefined` — billing is disabled (not explicitly enabled).
   */
  readonly billingEnabled?: boolean

  /**
   * @deprecated Not used for media billing. Identity is resolved from
   * sessionId + directory by the backend. Kept for backward compatibility
   * with non-media billing paths.
   */
  readonly billingUserId?: string

  /**
   * @deprecated Not used for media billing. Workspace identity is resolved
   * from sessionId + directory by the backend.
   */
  readonly billingWorkspaceId?: string

  /**
   * @deprecated Not used for media billing. Project identity is resolved
   * from sessionId + directory by the backend.
   */
  readonly billingProjectId?: string

  /** Per-provider configuration (API keys, custom endpoints, etc.). */
  readonly providers: Record<string, ProviderConfig>
}

export interface ProviderConfig {
  /** API key for this provider. Required when selected. */
  apiKey?: string
  /** Custom endpoint URL for this provider (e.g. gateway proxy). */
  endpoint?: string
}

// ── Service Tag ────────────────────────────────────────────────────────

/** Injectable MediaConfig tag — use `MediaConfigData` for the value type. */
export class MediaConfig extends Context.Tag("openimago/MediaConfig")<
  MediaConfig,
  MediaConfigData
>() {}

// ── Layer (skeleton — static fallback config) ──────────────────────────

/**
 * Skeleton MediaConfig layer.
 *
 * Reads from process.env at construction time:
 *   - OPENIMAGO_BACKEND_URL       → backendUrl
 *   - OPENIMAGO_BACKEND_API_KEY   → backendApiKey
 *   - OPENIMAGO_BILLING_DISABLED  → billingEnabled (false when set to "true")
 *   - OPENIMAGO_BILLING_USER_ID   → billingUserId
 *   - OPENIMAGO_BILLING_WORKSPACE → billingWorkspaceId
 *   - OPENIMAGO_BILLING_PROJECT   → billingProjectId
 *   - GOOGLE_API_KEY              → providers.google.apiKey
 *   - OPENAI_API_KEY              → providers.openai.apiKey
 *   - FAL_API_KEY                 → providers.fal.apiKey
 */
export const layer: Layer.Layer<MediaConfig> = Layer.succeed(MediaConfig, {
  backendUrl:
    (typeof process !== "undefined"
      ? process.env.OPENIMAGO_BACKEND_URL
      : undefined) ?? "http://localhost:5467",
  backendApiKey:
    typeof process !== "undefined"
      ? process.env.OPENIMAGO_BACKEND_API_KEY
      : undefined,
  billingEnabled:
    typeof process !== "undefined" && process.env.OPENIMAGO_BILLING_DISABLED === "true"
      ? false
      : undefined,
  billingUserId:
    typeof process !== "undefined"
      ? process.env.OPENIMAGO_BILLING_USER_ID
      : undefined,
  billingWorkspaceId:
    typeof process !== "undefined"
      ? process.env.OPENIMAGO_BILLING_WORKSPACE
      : undefined,
  billingProjectId:
    typeof process !== "undefined"
      ? process.env.OPENIMAGO_BILLING_PROJECT
      : undefined,
  providers: {
    google: {
      apiKey:
        typeof process !== "undefined"
          ? process.env.GOOGLE_API_KEY
          : undefined,
    },
    openai: {
      apiKey:
        typeof process !== "undefined"
          ? process.env.OPENAI_API_KEY
          : undefined,
    },
    fal: {
      apiKey:
        typeof process !== "undefined"
          ? process.env.FAL_KEY
          : undefined,
    },
  },
})
