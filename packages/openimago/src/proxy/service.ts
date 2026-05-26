export interface ProxyConfig {
  opencodeUrl: string
  basicAuth: string
}

import { logger } from "../server/logger"

export function createProxyConfig(opts?: { opencodeUrl?: string; authUsername?: string; authPassword?: string }): ProxyConfig {
  const opencodeUrl = opts?.opencodeUrl ?? process.env.OPENCODE_URL ?? "http://localhost:3000"
  const authUser = opts?.authUsername ?? process.env.OPENCODE_AUTH_USERNAME ?? "opencode"
  const authPass = opts?.authPassword ?? process.env.OPENCODE_AUTH_PASSWORD ?? ""
  const basicAuth = btoa(`${authUser}:${authPass}`)

  return { opencodeUrl, basicAuth }
}

export interface ForwardInput {
  method: string
  path: string
  directory: string
  workspaceId: string
  body?: unknown
}

/**
 * Build the target URL for forwarding a proxy request.
 * Strips /api prefix, injects workspace and directory params, preserves other query params.
 * The workspace must exist in OpenCode's workspace table before use.
 */
export function buildTargetUrl(
  config: ProxyConfig,
  incomingUrl: string,
  directory: string | undefined,
  workspaceId: string,
): string {
  const url = new URL(incomingUrl)
  const targetPath = url.pathname.replace(/^\/api/, "")
  const targetUrl = new URL(targetPath, config.opencodeUrl)

  const searchParams = new URLSearchParams()
  searchParams.set("workspace", workspaceId)
  if (directory) searchParams.set("directory", directory)

  url.searchParams.forEach((value, key) => {
    if (key !== "workspace" && key !== "directory") searchParams.set(key, value)
  })

  targetUrl.search = searchParams.toString()
  return targetUrl.toString()
}

/**
 * Build the forward headers for a proxy request.
 * Strips host/authorization from incoming headers, injects Basic Auth and directory header.
 * The x-opencode-directory header is the SDK-compatible way to pass directory to opencode
 * for all request methods (query param alone is only reliable for GET/HEAD via SDK rewrite).
 */
export function buildForwardHeaders(config: ProxyConfig, incomingHeaders: Headers, directory?: string): Headers {
  const headers = new Headers(incomingHeaders)
  headers.delete("host")
  headers.delete("authorization")
  // Prevent opencode from returning compressed bodies — the proxy decompresses
  // internally and re-streams plain bytes, so Content-Encoding would mismatch.
  headers.delete("accept-encoding")
  // Strip any client-supplied directory header — only openimago may set this.
  headers.delete("x-opencode-directory")
  headers.set("Authorization", `Basic ${config.basicAuth}`)
  // Inject directory as x-opencode-directory header (SDK convention, encodeURIComponent-encoded).
  // This ensures POST/PUT/PATCH requests also carry the directory, unlike ?directory= query param
  // which the SDK only injects for GET/HEAD via its rewrite interceptor.
  if (directory) headers.set("x-opencode-directory", directory)
  return headers
}

/**
 * Build the target URL for the simpler forward helper used by workdir routes.
 * Injects workspace and directory. The workspace must exist in OpenCode's
 * workspace table before use.
 */
export function buildForwardUrl(config: ProxyConfig, path: string, directory: string, workspaceId: string): string {
  const targetUrl = new URL(path, config.opencodeUrl)
  const params = new URLSearchParams()
  params.set("workspace", workspaceId)
  if (directory) params.set("directory", directory)
  targetUrl.search = params.toString()
  return targetUrl.toString()
}

export async function forward(config: ProxyConfig, input: ForwardInput): Promise<Response> {
  const url = buildForwardUrl(config, input.path, input.directory, input.workspaceId)

  const headers = new Headers()
  headers.set("Authorization", `Basic ${config.basicAuth}`)
  // Tell opencode which directory to use for this session.
  // The SDK uses x-opencode-directory header (encodeURIComponent-encoded) as the
  // primary mechanism — query param alone is insufficient for POST requests.
  headers.set("x-opencode-directory", input.directory)
  if (input.body !== undefined) {
    headers.set("content-type", "application/json")
  }

  logger.info({ method: input.method, url, directory: input.directory, workspaceId: input.workspaceId }, "proxy.forward: sending request")
  try {
    const res = await fetch(url, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    })
    logger.debug({ method: input.method, path: input.path, status: res.status }, "proxy.forward: received response")
    return res
  } catch {
    logger.error({ method: input.method, path: input.path }, "proxy.forward: opencode unreachable")
    return new Response(
      JSON.stringify({ error: { code: "OPENCODE_UNREACHABLE", message: "OpenCode service unavailable" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    )
  }
}

export async function proxyRequest(
  config: ProxyConfig,
  incomingUrl: string,
  method: string,
  incomingHeaders: Headers,
  body: ReadableStream<Uint8Array> | null | undefined,
  directory: string | undefined,
  workspaceId: string,
) {
  const targetUrl = buildTargetUrl(config, incomingUrl, directory, workspaceId)
  const headers = buildForwardHeaders(config, incomingHeaders, directory)

  logger.info({ method, targetUrl, workspaceId, directory }, "proxy.proxyRequest: forwarding")
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
    })

    const responseHeaders = new Headers(response.headers)
    // Remove content-encoding: the Bun/Node fetch already decompresses the body,
    // forwarding the header would cause a double-decompress in the browser.
    responseHeaders.delete("content-encoding")
    responseHeaders.delete("transfer-encoding")

    logger.debug({ method, targetUrl, status: response.status }, "proxy.proxyRequest: response received")
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch {
    logger.error({ method, targetUrl }, "proxy.proxyRequest: opencode unreachable")
    return new Response(
      JSON.stringify({ error: { code: "OPENCODE_UNREACHABLE", message: "OpenCode service unavailable" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    )
  }
}
