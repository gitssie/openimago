/**
 * Typed environment/config helpers for OpenImago plugin.
 *
 * Required config values must be provided by the runtime environment.
 * Missing required config causes clear, actionable errors — no hidden
 * hardcoded defaults for critical values like API keys or endpoints.
 */

/** All values the plugin may read from the runtime environment. */
export interface OpenImagoConfig {
  /** Backend API base URL for OpenImago services */
  backendUrl: string
  /** Optional: API key for the OpenImago backend */
  backendApiKey?: string
}

/**
 * Load and validate the plugin configuration from environment variables.
 *
 * Throws with a clear error message when a required variable is missing.
 */
export function loadConfig(
  env: Record<string, string | undefined>,
): OpenImagoConfig {
  const backendUrl = env.OPENIMAGO_BACKEND_URL

  if (!backendUrl) {
    throw new Error(
      "OPENIMAGO_BACKEND_URL is required but not set in environment",
    )
  }

  return {
    backendUrl,
    backendApiKey: env.OPENIMAGO_API_KEY,
  }
}
