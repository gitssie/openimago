import { eq } from "drizzle-orm"
import { signJwt } from "./jwt"
import { userId, authId } from "../utils/ids"
import { db } from "../db/client"
import { logger } from "../server/logger"
import { users, userAuths } from "../db/schema"
import { WorkspaceTable } from "../db/workspace-schema"
import { generateWorkspaceId } from "./workspace-id"

const STATE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface StateEntry {
  createdAt: number
}

const stateStore = new Map<string, StateEntry>()

// Periodic cleanup of expired states
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of stateStore) {
    if (now - entry.createdAt > STATE_TTL_MS) {
      stateStore.delete(key)
    }
  }
}, 60_000).unref()

function generateState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
}

function storeState(state: string): void {
  stateStore.set(state, { createdAt: Date.now() })
}

function validateAndConsumeState(state: string): boolean {
  const entry = stateStore.get(state)
  if (!entry) return false
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    stateStore.delete(state)
    return false
  }
  stateStore.delete(state)
  return true
}

interface ProviderConfig {
  authorizeUrl: string
  clientId: string
  clientSecret: string
  scope: string
  tokenUrl: string
  userInfoUrl: string
  emailsUrl?: string
}

const PROVIDERS: Record<string, ProviderConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    clientId: process.env.OAUTH_GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET ?? "",
    scope: "user:email",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userInfoUrl: "https://api.github.com/user",
    emailsUrl: "https://api.github.com/user/emails",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "",
    scope: "openid profile email",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
}

const REDIRECT_BASE =
  process.env.OAUTH_REDIRECT_BASE ?? "http://localhost:5173/auth/callback"

export class OAuthService {
  getRedirectUrl(
    provider: string,
    redirectUri?: string,
  ): { redirectUrl: string } | { error: { code: string; message: string }; status: 400 } {
    const cfg = PROVIDERS[provider]
    if (!cfg) {
      logger.warn({ provider }, "oauth.getRedirectUrl: unknown provider")
      return { error: { code: "INVALID_PROVIDER", message: `Unknown provider: ${provider}` }, status: 400 }
    }

    const state = generateState()
    storeState(state)

    const redirect = redirectUri ?? REDIRECT_BASE

    let url: string
    if (provider === "github") {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirect,
        state,
        scope: cfg.scope,
      })
      url = `${cfg.authorizeUrl}?${params.toString()}`
    } else {
      // google
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirect,
        state,
        scope: cfg.scope,
        response_type: "code",
      })
      url = `${cfg.authorizeUrl}?${params.toString()}`
    }

    logger.debug({ provider, redirect }, "oauth.getRedirectUrl: generated redirect")
    return { redirectUrl: url }
  }

  async handleCallback(
    provider: string,
    code: string,
    state: string,
  ): Promise<
    | { user: any; token: string; status: 200 }
    | { user: any; token: string; status: 201 }
    | { error: { code: string; message: string }; status: 400 }
  > {
    const cfg = PROVIDERS[provider]
    if (!cfg) {
      logger.warn({ provider }, "oauth.handleCallback: unknown provider")
      return { error: { code: "INVALID_PROVIDER", message: `Unknown provider: ${provider}` }, status: 400 }
    }

    if (!state || !validateAndConsumeState(state)) {
      logger.warn({ provider }, "oauth.handleCallback: invalid or expired state")
      return { error: { code: "INVALID_STATE", message: "Invalid or expired state" }, status: 400 }
    }

    // Exchange code for access token
    let accessToken: string
    try {
      accessToken = await exchangeCodeForToken(cfg, code, provider)
    } catch {
      logger.warn({ provider }, "oauth.handleCallback: token exchange failed")
      return { error: { code: "OAUTH_FAILED", message: "Failed to exchange code for token" }, status: 400 }
    }

    // Get user profile from provider
    let profile: OAuthProfile
    try {
      profile = await fetchOAuthProfile(accessToken, cfg, provider)
    } catch {
      logger.warn({ provider }, "oauth.handleCallback: failed to fetch user profile")
      return { error: { code: "OAUTH_FAILED", message: "Failed to fetch user profile" }, status: 400 }
    }

    logger.debug({ provider, email: profile.email }, "oauth.handleCallback: profile fetched, finding/creating user")
    // find-or-create user
    return findOrCreateUser(provider, profile)
  }

  /** Exposed for test: allow tests to pre-seed a state value */
  static _storeStateForTesting(state: string): void {
    storeState(state)
  }
}

interface OAuthProfile {
  providerId: string
  login?: string
  name?: string
  email: string
}

async function exchangeCodeForToken(
  cfg: ProviderConfig,
  code: string,
  provider: string,
): Promise<string> {
  const redirect = REDIRECT_BASE

  if (provider === "github") {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirect,
      }),
    })
    if (!res.ok) throw new Error("token exchange failed")
    const data = await res.json() as { access_token?: string; error?: string }
    if (data.error || !data.access_token) throw new Error("token exchange failed")
    return data.access_token
  } else {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
    })
    if (!res.ok) throw new Error("token exchange failed")
    const data = await res.json() as { access_token?: string; error?: string }
    if (data.error || !data.access_token) throw new Error("token exchange failed")
    return data.access_token
  }
}

async function fetchOAuthProfile(
  accessToken: string,
  cfg: ProviderConfig,
  provider: string,
): Promise<OAuthProfile> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("failed to fetch user info")
  const data = await res.json() as Record<string, any>

  let email = data.email as string | undefined | null
  if (!email && provider === "github" && cfg.emailsUrl) {
    const emailsRes = await fetch(cfg.emailsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (emailsRes.ok) {
      const emails = await emailsRes.json() as Array<{ email: string; primary: boolean }>
      const primary = emails.find((e) => e.primary)
      email = primary?.email ?? emails[0]?.email
    }
  }

  if (!email) throw new Error("no email from OAuth provider")

  return {
    providerId: String(data.id ?? data.sub),
    login: data.login as string | undefined,
    name: data.name as string | undefined,
    email,
  }
}

async function findOrCreateUser(
  provider: string,
  profile: OAuthProfile,
): Promise<
  | { user: any; token: string; status: 200 }
  | { user: any; token: string; status: 201 }
> {
  // Check existing user_auths
  const existingAuth = await db
    .select()
    .from(userAuths)
    .where(eq(userAuths.providerId, profile.providerId))

  if (existingAuth.length > 0) {
    const auth = existingAuth[0]!
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
    if (userRows.length > 0) {
      logger.info({ userId: userRows[0]!.id, provider, email: profile.email }, "oauth.findOrCreateUser: existing user login")
      const token = await signJwt({ userId: userRows[0]!.id, role: userRows[0]!.role })
      return { user: userRows[0]!, token, status: 200 }
    }
  }

  // Create new user
  const username = await generateUsername(profile)
  const id = userId()
  const now = new Date()
  const workspaceId = generateWorkspaceId()

  const user = {
    id,
    username,
    email: profile.email.toLowerCase(),
    displayName: profile.name ?? null,
    workspaceId,
    role: "user",
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(users).values(user)
  await db.insert(userAuths).values({
    id: authId(),
    userId: id,
    provider,
    providerId: profile.providerId,
    passwordHash: null,
    createdAt: now,
  })

  await db.insert(WorkspaceTable).values({
    id: workspaceId,
    type: "worktree",
    name: "",
    directory: "",
    project_id: "global",
    time_used: Date.now(),
  })

  const token = await signJwt({ userId: id, role: "user" })
  logger.info({ userId: id, provider, email: profile.email, username }, "oauth.findOrCreateUser: new user created")
  return { user, token, status: 201 }
}

async function generateUsername(profile: OAuthProfile): Promise<string> {
  let base = (profile.login || profile.email.split("@")[0]!)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32)
  if (base.length < 3) base = base.padEnd(3, "0")

  // Check for duplicates
  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.username, base))

  if (existing.length > 0) {
    const suffix = crypto.randomUUID().slice(0, 6).replace(/-/g, "")
    base = `${base.slice(0, 28)}_${suffix}`
  }
  return base
}

export const oauthService = new OAuthService()
