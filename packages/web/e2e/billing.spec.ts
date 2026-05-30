import { test, expect } from '@playwright/test'

// ════════════════════════════════════════════════════════════════
// Helper: seed auth state via localStorage (bypass login form).
// Must use addInitScript so localStorage is populated BEFORE the
// SPA's Pinia store reads it on initialization.
// ════════════════════════════════════════════════════════════════
function seedAuthScript() {
  return `
    localStorage.setItem('token', 'test-e2e-token');
    localStorage.setItem('user', JSON.stringify({
      id: 'usr_e2e_test',
      username: 'e2e-user',
      email: 'e2e@test.com',
      role: 'user',
      workspaceId: 'wrk_e2e',
    }));
  `
}

// ════════════════════════════════════════════════════════════════
// Helper: mock billing API route on the page
// ════════════════════════════════════════════════════════════════
async function mockApi(page: import('@playwright/test').Page, path: string, json: unknown) {
  // Use regex instead of glob so query params (e.g. ?limit=200) are matched.
  // Glob `**/api/...` does not match `/api/...?limit=200`.
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.route(new RegExp(`${escaped}(\\?.*)?$`), (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(json),
    })
  })
}

// ════════════════════════════════════════════════════════════════
// Test: billing page smoke
// ════════════════════════════════════════════════════════════════

test.describe('Billing page', () => {
  test.beforeEach(async ({ page }) => {
    // Inject auth BEFORE the page loads
    await page.addInitScript(seedAuthScript())

    // Mock billing account API
    await mockApi(page, '/api/platform/billing/account', {
      account: {
        id: 'bac_e2e',
        ownerType: 'user',
        ownerId: 'usr_e2e_test',
        currency: 'CNY',
        balanceMicros: 150_000_000, // ¥150.00
        minimumBalanceMicros: 10_000_000, // ¥10.00
        creditLimitMicros: 0,
        status: 'active',
        createdAt: '2026-01-15T08:00:00Z',
        updatedAt: '2026-01-15T08:00:00Z',
      },
    })

    // Mock billing ledger API
    await mockApi(page, '/api/platform/billing/ledger', {
      entries: [
        {
          id: 'bdl_e2e_1',
          accountId: 'bac_e2e',
          userId: 'usr_e2e_test',
          workspaceId: null,
          projectId: null,
          sessionId: null,
          entryType: 'credit',
          sourceType: 'admin',
          sourceId: 'crd_e2e',
          sourceStatus: 'completed',
          provider: null,
          model: null,
          toolName: null,
          mediaKind: null,
          quantity: null,
          unit: null,
          amountMicros: 200_000_000,
          balanceAfterMicros: 200_000_000,
          currency: 'CNY',
          pricingSnapshot: null,
          metadata: null,
          createdAt: '2026-01-20T10:00:00Z',
        },
        {
          id: 'bdl_e2e_2',
          accountId: 'bac_e2e',
          userId: 'usr_e2e_test',
          workspaceId: 'wrk_e2e',
          projectId: 'proj_test',
          sessionId: 'ses_test',
          entryType: 'charge',
          sourceType: 'toolcall',
          sourceId: 'tch_e2e',
          sourceStatus: 'completed',
          provider: 'deepseek',
          model: 'deepseek-v4',
          toolName: 'read_file',
          mediaKind: null,
          quantity: 5000,
          unit: 'tokens',
          amountMicros: -50_000_000,
          balanceAfterMicros: 150_000_000,
          currency: 'CNY',
          pricingSnapshot: null,
          metadata: null,
          createdAt: '2026-01-21T14:30:00Z',
        },
      ],
      total: 2,
    })
  })

  test('renders account balance, minimum, and credit limit cards', async ({ page }) => {
    // Quasar uses hash-based routing by default (createWebHashHistory).
    // Navigate to hash route, not path.
    await page.goto('/#/billing', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Account cards
    await expect(page.locator('.acct-card__value').first()).toContainText('¥150', { timeout: 10000 })
    await expect(page.locator('.billing-page')).toContainText('最低余额', { timeout: 10000 })
    await expect(page.locator('.billing-page')).toContainText('信用额度', { timeout: 10000 })
  })

  test('renders ledger table with entries', async ({ page }) => {
    await page.goto('/#/billing', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Check ledger entries are visible in page body
    await expect(page.locator('body')).toContainText('充值')
    await expect(page.locator('body')).toContainText('200')
    await expect(page.locator('body')).toContainText('消费')
    await expect(page.locator('body')).toContainText('deepseek')
  })

  test('shows manual recharge info banner', async ({ page }) => {
    await page.goto('/#/billing', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.locator('.note-banner')).toContainText('手动充值')
  })

  test('shows filter controls', async ({ page }) => {
    await page.goto('/#/billing', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await expect(page.locator('.filter-bar')).toBeVisible()
  })
})

// ════════════════════════════════════════════════════════════════
// Deferred: prompt insufficient-balance E2E test
//
// The prompt blocking test requires a running proxy middleware and
// resolution of session directories via SessionTable. The proxy
// routes forward to OpenCode, and the balance check happens inside
// createProxyRoutes().  Making this deterministic without a real
// OpenCode service requires either:
//
//   1. A full backend + proxy server with a test DB, or
//   2. Mocking fetch() inside the SPA's proxy code at the browser level.
//
// Neither is feasible in this slice.  The component tests in
// BillingPage.test.ts already cover the balance-checking logic
// (INSUFFICIENT_BALANCE code, 402 status).  Backend integration
// tests (packages/openimago/tests/billing.test.ts) cover the full
// server-side prompt/balance integration.
//
// Recommendation: add this E2E test after a test-harness mode is
// available that can run the full backend + proxy stack against a
// test PostgreSQL instance.
// ════════════════════════════════════════════════════════════════
