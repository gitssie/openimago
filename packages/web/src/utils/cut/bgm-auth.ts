// Auth-header wiring for the Cut's BGM media fetch (openimago-tc8t).
//
// The BGM bed resolves to the authed `/api/platform/assets/:id/download`, which
// requires the app's Bearer token (mirrors src/api/client.ts). Clip previews are
// static same-origin /mock files and need NO auth. The fork must NOT reach into
// the web auth store, so the HOST (StoryCutPanel) builds these headers from its
// auth store and threads them down through the hydrate contract.
//
// Pure + unit-tested: keeps the "token → headers" rule in one place so the host
// SFC stays thin and the behaviour is verifiable without a browser.

/**
 * Build the request headers for the BGM media fetch from the current auth token.
 * Returns `{ Authorization: 'Bearer <token>' }` for a non-empty token, else an
 * empty object (anonymous fetch) — never a header with an empty/`null` value,
 * which a server could reject differently from "no header".
 */
export function bgmAuthHeaders(token: string | null | undefined): Record<string, string> {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}
