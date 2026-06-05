import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// ════════════════════════════════════════════════════════════════
// Helpers
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

async function mockApi(
  page: import('@playwright/test').Page,
  apiPath: string,
  json: unknown,
  status = 200,
) {
  const escaped = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await page.route(new RegExp(`${escaped}(\\?.*)?$`), (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(json),
    })
  })
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
function fixture(...segments: string[]): string {
  return path.join(FIXTURES_DIR, ...segments)
}

// ════════════════════════════════════════════════════════════════
// Unified Attachments E2E Tests
// ════════════════════════════════════════════════════════════════

test.describe('Homepage unified attachments', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedAuthScript())

    // Mock /auth/me — required after token verification guard was added
    await mockApi(page, '/auth/me', {
      id: 'usr_e2e_test',
      username: 'e2e-user',
      email: 'e2e@test.com',
      role: 'user',
      workspaceId: 'wrk_e2e',
    })

    // Mock gallery API
    await mockApi(page, '/api/platform/gallery', {
      items: [],
      nextCursor: null,
      hasMore: false,
    })

    // Mock temp upload API — returns attachment IDs with scope metadata
    await mockApi(page, '/api/platform/temp-uploads', {
      batchId: 'batch_e2e_01',
      attachments: [
        {
          id: 'tmp_e2e_001',
          filename: 'test-image.png',
          mimeType: 'image/png',
          size: 100,
          status: 'pending',
        },
      ],
    }, 201)

    // Mock session creation
    await mockApi(page, '/api/session', {
      id: 'ses_e2e_prompt',
      directory: '/tmp/e2e-session-dir',
      title: 'E2E Session',
      workspace_id: 'wrk_e2e',
    }, 201)

    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  // ── Test 1: Upload calls temp-uploads, not assets/upload ──────
  test('file upload routes to POST /api/platform/temp-uploads', async ({ page }) => {
    // Intercept BOTH endpoints and record which one is called
    const tempUploadCalls: unknown[][] = []
    const assetUploadCalls: unknown[][] = []

    await page.route('**/api/platform/temp-uploads', (route) => {
      tempUploadCalls.push([route.request().method(), route.request().url()])
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          batchId: 'batch_e2e_01',
          attachments: [
            { id: 'tmp_e2e_001', filename: 'test-image.png', mimeType: 'image/png', size: 100, status: 'pending' },
          ],
        }),
      })
    })

    await page.route('**/api/platform/assets/upload', (route) => {
      assetUploadCalls.push([route.request().method(), route.request().url()])
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          asset: { id: 'ast_fallback', filename: 'test.png', type: 'image', url: '', thumbnailUrl: null, createdAt: new Date().toISOString() },
        }),
      })
    })

    // Click + to open popup
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    // Select image file
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip to appear in uploaded state
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toBeVisible({ timeout: 5000 })

    // Assert: temp-uploads was called, assets/upload was NOT
    expect(tempUploadCalls.length).toBeGreaterThanOrEqual(1)
    expect(assetUploadCalls.length).toBe(0)
  })

  // ── Test 2: Prompt request contains attachments, not assetIds ─
  test('prompt send includes attachments array with scope temporary', async ({ page }) => {
    // Intercept prompt requests to inspect the body
    const promptBodies: unknown[] = []
    await page.route('**/api/session/**/prompt', async (route) => {
      const raw = await route.request().postData()
      try { promptBodies.push(JSON.parse(raw ?? '{}')) } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'ok' }),
      })
    })

    // First, upload a file
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip to show uploaded state (indicates temp attachment registered)
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toHaveClass(/imago-attachment-chip--uploaded/, { timeout: 10000 })
    // Allow additional time for reactive state to settle
    await page.waitForTimeout(1000)

    // Type a prompt and click the send button
    const textInput = page.locator('.prompt-input textarea, .prompt-input input[type="text"], .chat-input textarea').first()
    await textInput.fill('create a video from this image')
    await page.waitForTimeout(300)
    // Click send button (arrow_upward icon when has draft)
    const sendBtn = page.locator('.send-btn')
    await sendBtn.click()

    // Wait for the prompt request to fire
    await page.waitForTimeout(3000)

    // Assert prompt request was made
    expect(promptBodies.length).toBeGreaterThanOrEqual(1)
    const promptBody = promptBodies[0] as Record<string, unknown>

    // Must have attachments array with temporary scope
    expect(promptBody.attachments).toBeDefined()
    const attachments = promptBody.attachments as Array<Record<string, unknown>>
    expect(attachments.length).toBeGreaterThanOrEqual(1)
    expect(attachments[0]!.scope).toBe('temporary')
    expect(attachments[0]!.id).toBe('tmp_e2e_001')
    expect(attachments[0]!.mime).toBe('image/png')

    // Must NOT contain metadata.assetIds
    if (promptBody.metadata) {
      const meta = promptBody.metadata as Record<string, unknown>
      expect(meta.assetIds).toBeUndefined()
    }
  })

  // ── Test 3: Multi-file upload → multiple attachments ─────────
  test('multiple uploaded files produce multiple attachment entries', async ({ page }) => {
    // Mock temp upload with 2 attachments
    await mockApi(page, '/api/platform/temp-uploads', {
      batchId: 'batch_e2e_multi',
      attachments: [
        { id: 'tmp_e2e_001', filename: 'test-image.png', mimeType: 'image/png', size: 100, status: 'pending' },
        { id: 'tmp_e2e_002', filename: 'test-text.txt', mimeType: 'text/plain', size: 50, status: 'pending' },
      ],
    }, 201)

    // Remove beforeEach prompt mock so our interceptor can capture
    await page.unroute('**/api/session/**/prompt')

    // Intercept prompt requests
    const promptBodies: unknown[] = []
    await page.route('**/api/session/**/prompt', async (route) => {
      const raw = await route.request().postData()
      try { promptBodies.push(JSON.parse(raw ?? '{}')) } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'ok' }),
      })
    })

    // Upload two files
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles([
      fixture('test-image.png'),
      fixture('test-text.txt'),
    ])

    // Wait for chips
    const chips = page.locator('.imago-attachment-chip')
    await expect(chips).toHaveCount(2, { timeout: 10000 })

    // Submit — click send button
    const textInput = page.locator('.prompt-input textarea, .prompt-input input[type="text"], .chat-input textarea').first()
    await textInput.fill('use these files')
    await page.waitForTimeout(300)
    await page.locator('.send-btn').click()

    await page.waitForTimeout(3000)

    // Assert both attachments in request
    expect(promptBodies.length).toBeGreaterThanOrEqual(1)
    const promptBody = promptBodies[0] as Record<string, unknown>
    const attachments = promptBody.attachments as Array<Record<string, unknown>>
    expect(attachments.length).toBe(2)
    expect(attachments[0]!.scope).toBe('temporary')
    expect(attachments[1]!.scope).toBe('temporary')
  })

  // ── Test 4: Removal of chip excludes from attachments ────────
  test('removing an attachment chip excludes it from prompt attachments', async ({ page }) => {
    const promptBodies: unknown[] = []
    await page.route('**/api/session/**/prompt', async (route) => {
      const raw = await route.request().postData()
      try { promptBodies.push(JSON.parse(raw ?? '{}')) } catch { /* ignore */ }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: 'ok' }),
      })
    })

    // Upload a file
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toHaveClass(/imago-attachment-chip--uploaded/, { timeout: 10000 })

    // Remove the chip
    const removeBtn = chip.locator('.imago-attachment-chip__remove')
    await removeBtn.click()
    await expect(page.locator('.imago-attachment-chip')).toHaveCount(0)

    // Submit prompt
    const textInput = page.locator('.prompt-input textarea, .prompt-input input[type="text"]').first()
    await textInput.fill('just text, no files')
    await textInput.press('Enter')

    await page.waitForTimeout(3000)

    // Assert: attachments should be empty or not present
    expect(promptBodies.length).toBeGreaterThanOrEqual(1)
    const promptBody = promptBodies[0] as Record<string, unknown>
    const attachments = promptBody.attachments as Array<unknown> | undefined
    expect(attachments?.length ?? 0).toBe(0)
  })
})
