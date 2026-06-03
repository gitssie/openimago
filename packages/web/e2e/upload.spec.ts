import { test, expect } from '@playwright/test'
import path from 'path'

// ════════════════════════════════════════════════════════════════
// Helper: seed auth state via localStorage (bypass login form)
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
// Helper: mock an API route on the page
// ════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════
// Fixture path helper
// ════════════════════════════════════════════════════════════════
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
function fixture(...segments: string[]): string {
  return path.join(FIXTURES_DIR, ...segments)
}

// ════════════════════════════════════════════════════════════════
// Upload E2E Tests
// ════════════════════════════════════════════════════════════════

test.describe('File upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedAuthScript())

    // Mock gallery API so the home page loads cleanly
    await mockApi(page, '/api/platform/gallery', {
      items: [],
      nextCursor: null,
      hasMore: false,
    })

    // Navigate to home page (Hash-based routing)
    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  // ── Test 1: ImagePickerPopup popup ───────────────────────────────
  test('clicking + button opens upload type selector with 4 items', async ({ page }) => {
    // Click the + button
    const plusBtn = page.locator('.prompt-input__icon-btn').first()
    await expect(plusBtn).toBeVisible({ timeout: 5000 })
    await plusBtn.click()

    // Wait for the popup menu
    const popup = page.locator('.upload-menu-popup')
    await expect(popup).toBeVisible({ timeout: 5000 })

    // Verify all 4 type buttons
    const items = popup.locator('.upload-menu-popup__item')
    await expect(items).toHaveCount(4)

    const labels = popup.locator('.upload-menu-popup__label')
    await expect(labels.nth(0)).toHaveText('图片')
    await expect(labels.nth(1)).toHaveText('音频')
    await expect(labels.nth(2)).toHaveText('视频')
    await expect(labels.nth(3)).toHaveText('文本')
  })

  // ── Test 2: Image selection triggers upload chip ─────────────────
  test('selecting an image file shows an uploading chip', async ({ page }) => {
    // Mock upload API — return pending response (will be consumed later)
    await mockApi(page, '/api/platform/assets/upload', {
      asset: {
        id: 'ast_e2e_1',
        name: 'test-image.png',
        filename: 'test-image.png',
        type: 'image',
        url: 'https://example.com/test-image.png',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      },
    })

    // Click + to open popup
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    // Set up file chooser listener BEFORE clicking the image button
    const fileChooserPromise = page.waitForEvent('filechooser')

    // Click "图片" (image type button — first item)
    await page.locator('.upload-menu-popup__item').first().click()

    // Handle the file chooser
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Verify chip appears
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toBeVisible({ timeout: 5000 })
    await expect(chip.locator('.imago-attachment-chip__name')).toContainText('test-image')
  })

  // ── Test 3: Upload success state ─────────────────────────────────
  test('successful upload shows uploaded chip state', async ({ page }) => {
    await mockApi(page, '/api/platform/assets/upload', {
      asset: {
        id: 'ast_e2e_success',
        name: 'test-image.png',
        filename: 'test-image.png',
        type: 'image',
        url: 'https://example.com/uploaded.png',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      },
    })

    // Open popup and trigger file selection
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip to transition to uploaded state
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toHaveClass(/imago-attachment-chip--uploaded/, { timeout: 10000 })

    // No error text visible
    await expect(chip.locator('.imago-attachment-chip__error-text')).toHaveCount(0)
  })

  // ── Test 4: Upload failure state ─────────────────────────────────
  test('failed upload shows error chip with retry button', async ({ page }) => {
    await mockApi(page, '/api/platform/assets/upload', {
      error: { code: 'UPLOAD_FAILED', message: 'Server upload error' },
    }, 500)

    // Open popup and select image file
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip to show error state
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toHaveClass(/imago-attachment-chip--error/, { timeout: 10000 })

    // Error text is shown
    await expect(chip.locator('.imago-attachment-chip__error-text')).toBeVisible()

    // Retry button is visible
    await expect(chip.locator('.imago-attachment-chip__retry')).toBeVisible()
  })

  // ── Test 5: Oversized file rejected by frontend ──────────────────
  test('file exceeding 20MB image limit is rejected with error chip', async ({ page }) => {
    // Override File.prototype.size so the test fixture reports as 21MB
    await page.evaluate(() => {
      const desc = Object.getOwnPropertyDescriptor(File.prototype, 'size')
      const orig = desc?.get
      Object.defineProperty(File.prototype, 'size', {
        get(this: File) {
          if (this.name === 'test-image.png') {
            return 21 * 1024 * 1024
          }
          return orig ? orig.call(this) : 0
        },
        configurable: true,
      })
    })

    // No upload mock needed — frontend should reject before API call

    // Open popup and select image
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Chip appears in error state immediately (frontend rejection)
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toBeVisible({ timeout: 5000 })
    await expect(chip).toHaveClass(/imago-attachment-chip--error/, { timeout: 5000 })

    // Error message mentions file size limit
    await expect(chip.locator('.imago-attachment-chip__error-text')).toContainText('文件过大')
  })

  // ── Test 6: File removal ─────────────────────────────────────────
  test('clicking remove button removes the attachment chip', async ({ page }) => {
    await mockApi(page, '/api/platform/assets/upload', {
      asset: {
        id: 'ast_e2e_remove',
        name: 'test-image.png',
        filename: 'test-image.png',
        type: 'image',
        url: 'https://example.com/to-remove.png',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      },
    })

    // Upload a file first
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(fixture('test-image.png'))

    // Wait for chip to appear
    const chip = page.locator('.imago-attachment-chip').first()
    await expect(chip).toBeVisible({ timeout: 5000 })

    // Click the remove button on the chip
    const removeBtn = chip.locator('.imago-attachment-chip__remove')
    await removeBtn.click()

    // Chip should be removed
    await expect(page.locator('.imago-attachment-chip')).toHaveCount(0)
  })

  // ── Test 7: Multi-file upload ────────────────────────────────────
  test('selecting multiple files creates multiple chips', async ({ page }) => {
    await mockApi(page, '/api/platform/assets/upload', {
      asset: {
        id: 'ast_e2e_multi',
        name: 'uploaded.png',
        filename: 'uploaded.png',
        type: 'image',
        url: 'https://example.com/uploaded.png',
        thumbnailUrl: null,
        createdAt: new Date().toISOString(),
      },
    })

    // Open popup and trigger file selection
    await page.locator('.prompt-input__icon-btn').first().click()
    await expect(page.locator('.upload-menu-popup')).toBeVisible({ timeout: 3000 })

    // Use generic file picker (the attach_file default slot) instead of the image type
    // Since our test file is small we use the image flow which accepts image/*
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('.upload-menu-popup__item').first().click()
    const fileChooser = await fileChooserPromise

    // Select both the image and text fixtures
    await fileChooser.setFiles([
      fixture('test-image.png'),
      fixture('test-text.txt'),
    ])

    // Wait for chips to appear — expect at least 2
    const chips = page.locator('.imago-attachment-chip')
    await expect(chips).toHaveCount(2, { timeout: 10000 })

    // Verify both filenames are visible
    await expect(chips.nth(0).locator('.imago-attachment-chip__name')).toContainText('test-image')
    await expect(chips.nth(1).locator('.imago-attachment-chip__name')).toContainText('test-text')
  })
})
