import { test, expect, type APIRequestContext } from '@playwright/test'

// ════════════════════════════════════════════════════════════════
// E2E: prompt insufficient-balance blocking (full stack)
//
// Preconditions (all must be satisfied, or the test is skipped):
//
//   1. Backend server running on PLAYWRIGHT_API_BASE (default :5467)
//      with DATABASE_URL pointing to a PostgreSQL instance that has
//      billing tables migrated.
//
//   2. OpenCode service running on localhost:4096 (needed for
//      session creation via the proxy).
//
//   3. An existing admin user in the DB (set ADMIN_TOKEN env var).
//      Without a bootstrap admin, new admin registration is
//      impossible because the backend always creates role=user.
//      Workaround: register a user, then promote via DB:
//        UPDATE users SET role='admin' WHERE username='...';
//      Then login and pass the token in ADMIN_TOKEN.
//
//   4. PLAYWRIGHT_SKIP_WEBSERVER=1 (use already-running dev server)
//      and PLAYWRIGHT_BASE_URL pointing to the web dev server.
//
// Example:
//   # Terminal 1: backend
//   cd packages/openimago
//   DATABASE_URL=postgres://localhost:5432/mydb \
//     COS_BASE_PATH=/tmp/cos \
//     bun run --watch src/index.ts
//
//   # Terminal 2: web dev server
//   cd packages/web
//   bun run dev
//
//   # Terminal 3: run E2E
//   cd packages/web
//   PLAYWRIGHT_SKIP_WEBSERVER=1 \
//     PLAYWRIGHT_API_BASE=http://localhost:5467 \
//     ADMIN_TOKEN=<token-for-existing-admin> \
//     bun run test:e2e -- e2e/billing-prompt-block.spec.ts
//
// ════════════════════════════════════════════════════════════════

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? 'http://localhost:5467'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? ''

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

interface UserInfo {
  token: string
  userId: string
  workspaceId: string
}

async function registerUser(request: APIRequestContext): Promise<UserInfo> {
  const username = `e2e_pb_${crypto.randomUUID().slice(0, 8)}`
  const email = `${username}@e2e.test`
  const res = await request.post(`${API_BASE}/auth/register`, {
    data: { username, email, password: 'e2e-pass-123' },
  })
  expect(res.status()).toBe(201)
  const body = await res.json() as Record<string, any>
  return {
    token: body.token as string,
    userId: body.user.id as string,
    workspaceId: body.user.workspaceId as string,
  }
}

async function setupBlockedAccount(
  request: APIRequestContext,
  user: UserInfo,
): Promise<string> {
  // 1. Get account ID via the user-facing billing API
  let accountId: string
  const acctRes = await request.get(`${API_BASE}/api/platform/billing/account`, {
    headers: { Authorization: `Bearer ${user.token}` },
  })
  const acctBody = await acctRes.json() as Record<string, any>
  accountId = acctBody.account?.id as string

  if (!accountId) {
    throw new Error('No billing account returned for user')
  }

  // 2. Admin sets minimumBalanceMicros high enough to block
  const patchRes = await request.patch(`${API_BASE}/api/admin/billing/accounts/${accountId}`, {
    data: { minimumBalanceMicros: 1_000_000 }, // 1 CNY minimum
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  })
  expect(patchRes.status(), 'admin PATCH account config').toBe(200)

  return accountId
}

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════

test.describe('Prompt insufficient-balance blocking (full stack)', () => {
  test.beforeAll(async ({ request }) => {
    // Check backend reachability
    let reachable = false
    try {
      const res = await request.get(`${API_BASE}/auth/me`)
      reachable = res.status() !== 0
    } catch {
      // unreachable
    }

    if (!reachable) {
      test.skip(true,
        `Backend not reachable at ${API_BASE}. ` +
        'Start the backend first. See file header for setup instructions.',
      )
    }
  })

  test('prompt POST returns 402 INSUFFICIENT_BALANCE', async ({ request }) => {
    // Check admin token
    if (!ADMIN_TOKEN) {
      test.skip(true,
        'ADMIN_TOKEN env var not set. ' +
        'Create an admin user (UPDATE users SET role=\'admin\'), login, and pass the token.',
      )
    }

    // Step 1: Register a normal user
    const user = await registerUser(request)

    // Step 2: Set minimum balance above current balance (0)
    const accountId = await setupBlockedAccount(request, user)

    // Step 3: Verify account state
    const acctRes = await request.get(`${API_BASE}/api/platform/billing/account`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
    const acctBody = await acctRes.json() as Record<string, any>
    expect(acctBody.account.minimumBalanceMicros).toBe(1_000_000)
    expect(acctBody.account.balanceMicros).toBe(0)

    // Step 4: Attempt to send a prompt — requires a session.
    // Session creation goes through the proxy to OpenCode.
    // If OpenCode is not reachable, this will fail with 502.
    // The proxy guard checks balance BEFORE forwarding to OpenCode,
    // so we can test the guard even if OpenCode is unreachable
    // for the prompt endpoint specifically — but session creation
    // needs OpenCode.

    // Check if OpenCode is reachable for session creation
    let sessionCreated = false
    let sessionId = ''
    try {
      const sesRes = await request.post(`${API_BASE}/api/session`, {
        data: {},
        headers: { Authorization: `Bearer ${user.token}` },
      })
      if (sesRes.status() === 201) {
        const sesBody = await sesRes.json() as Record<string, any>
        sessionId = sesBody.id as string
        sessionCreated = !!sessionId
      }
    } catch {
      // OpenCode unreachable — session creation failed
    }

    if (!sessionCreated) {
      test.skip(true,
        'OpenCode not reachable for session creation. ' +
        'Ensure OpenCode is running on port 4096.',
      )
    }

    // Step 5: Try to send a prompt → expect 402
    const promptRes = await request.post(`${API_BASE}/api/session/${sessionId}/prompt`, {
      data: { prompt: 'hello' },
      headers: { Authorization: `Bearer ${user.token}` },
    })

    expect(promptRes.status()).toBe(402)
    const promptBody = await promptRes.json() as Record<string, any>
    expect(promptBody.error.code).toBe('INSUFFICIENT_BALANCE')
    expect(promptBody.error.message).toContain('Insufficient balance')
  })
})
