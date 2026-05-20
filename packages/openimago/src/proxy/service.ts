export interface ProxyConfig {
  opencodeUrl: string
  basicAuth: string
}

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
 * Strips host/authorization from incoming headers, injects Basic Auth.
 */
export function buildForwardHeaders(config: ProxyConfig, incomingHeaders: Headers): Headers {
  const headers = new Headers(incomingHeaders)
  headers.delete("host")
  headers.delete("authorization")
  headers.set("Authorization", `Basic ${config.basicAuth}`)
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
  params.set("directory", directory)
  targetUrl.search = params.toString()
  return targetUrl.toString()
}

export async function forward(config: ProxyConfig, input: ForwardInput): Promise<Response> {
  const url = buildForwardUrl(config, input.path, input.directory, input.workspaceId)

  const headers = new Headers()
  headers.set("Authorization", `Basic ${config.basicAuth}`)
  if (input.body !== undefined) {
    headers.set("content-type", "application/json")
  }

  try {
    return await fetch(url, {
      method: input.method,
      headers,
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    })
  } catch {
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
  const headers = buildForwardHeaders(config, incomingHeaders)

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" && method !== "HEAD" ? body : undefined,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch {
    return new Response(
      JSON.stringify({ error: { code: "OPENCODE_UNREACHABLE", message: "OpenCode service unavailable" } }),
      { status: 502, headers: { "content-type": "application/json" } },
    )
  }
}
