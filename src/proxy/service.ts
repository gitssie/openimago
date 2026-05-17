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
  userId: string
  body?: unknown
}

export async function forward(config: ProxyConfig, input: ForwardInput): Promise<Response> {
  const targetUrl = new URL(input.path, config.opencodeUrl)
  const params = new URLSearchParams()
  params.set("workspace", input.userId)
  params.set("directory", input.directory)
  targetUrl.search = params.toString()

  const headers = new Headers()
  headers.set("Authorization", `Basic ${config.basicAuth}`)
  if (input.body !== undefined) {
    headers.set("content-type", "application/json")
  }

  try {
    return await fetch(targetUrl.toString(), {
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
  userId: string,
) {
  const url = new URL(incomingUrl)
  const targetPath = url.pathname.replace(/^\/api/, "")
  const targetUrl = new URL(targetPath, config.opencodeUrl)

  const searchParams = new URLSearchParams()
  searchParams.set("workspace", userId)
  if (directory) {
    searchParams.set("directory", directory)
  }

  url.searchParams.forEach((value, key) => {
    if (key !== "workspace" && key !== "directory") {
      searchParams.set(key, value)
    }
  })

  targetUrl.search = searchParams.toString()

  const headers = new Headers(incomingHeaders)
  headers.delete("host")
  headers.delete("authorization")
  headers.set("Authorization", `Basic ${config.basicAuth}`)

  try {
    const response = await fetch(targetUrl.toString(), {
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
