import { test, expect } from '@playwright/test'

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

// ════════════════════════════════════════════════════════════════
// Mock project items
// ════════════════════════════════════════════════════════════════
function makeProject(i: number) {
  const daysAgo = (i + 1) * 3
  const date = new Date(Date.now() - daysAgo * 86_400_000)
  return {
    id: `proj_e2e_${i}`,
    name: `Project ${String.fromCharCode(65 + i - 1)}`, // Project A, B, C...
    description: i % 3 === 0 ? `Description for project ${i}` : undefined,
    directory: `/workspace/project-${i}`,
    status: 'active' as const,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  }
}

function mockProjects(page: import('@playwright/test').Page, count: number) {
  const projects = Array.from({ length: count }, (_, i) => makeProject(i + 1))
  return mockApi(page, '/api/platform/projects', { projects })
}

// ════════════════════════════════════════════════════════════════

test.describe('Projects page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedAuthScript())
    // Default empty projects — individual tests override
    await mockProjects(page, 0)
    await page.goto('/#/projects', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  // ── Test 1: Empty project list ────────────────────────────────────
  test('shows empty state when no projects exist', async ({ page }) => {
    // Page header is visible
    await expect(page.locator('.page-header__title')).toHaveText('我的项目', { timeout: 5000 })

    // Empty state component shows
    const empty = page.locator('.page-empty')
    await expect(empty).toBeVisible({ timeout: 8000 })
    await expect(empty.locator('.page-empty__title')).toContainText(/项目/)
    await expect(empty.locator('.page-empty__desc')).toBeVisible()

    // Action button in empty state
    const ctaBtn = empty.locator('.page-empty__cta')
    await expect(ctaBtn).toBeVisible()
    await expect(ctaBtn).toHaveText('新建项目')
  })

  // ── Test 2: Project cards render with name, thumbs, meta ──────────
  test('renders project cards with names and session counts', async ({ page }) => {
    await mockProjects(page, 4)

    await page.goto('/#/projects', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Project grid is visible
    const grid = page.locator('.projects-grid')
    await expect(grid).toBeVisible({ timeout: 8000 })

    // 4 cards visible
    const cards = grid.locator('.project-card-wrap')
    await expect(cards).toHaveCount(4, { timeout: 5000 })

    // First card shows project name
    const firstCard = cards.first()
    await expect(firstCard.locator('.project-card__title')).toHaveText('Project A')

    // Meta info: session count and "最近活跃" label
    await expect(firstCard.locator('.project-card__meta')).toBeVisible()
    await expect(firstCard.locator('.project-card__meta')).toContainText('会话数量')
    await expect(firstCard.locator('.project-card__meta')).toContainText('最近活跃')

    // Thumbnail placeholders (2x2 grid = 4 thumbs per card)
    const thumbs = firstCard.locator('.project-thumb')
    await expect(thumbs).toHaveCount(4)
  })

  // ── Test 3: Search filtering ──────────────────────────────────────
  test('search input filters projects by name', async ({ page }) => {
    await mockProjects(page, 5) // Project A through E

    await page.goto('/#/projects', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Verify all 5 cards visible initially
    const cards = page.locator('.project-card-wrap')
    await expect(cards).toHaveCount(5, { timeout: 5000 })

    // Type search query in the search input
    const searchInput = page.locator('.page-header__search-input')
    await expect(searchInput).toBeVisible()

    // Search for "Project A" — only card A should remain
    await searchInput.fill('Project A')
    await page.waitForTimeout(500)

    // Should filter to only Project A
    await expect(cards).toHaveCount(1)
    await expect(cards.first().locator('.project-card__title')).toHaveText('Project A')

    // Search for non-matching term — no results
    await searchInput.fill('ZZZ_NOT_FOUND')
    await page.waitForTimeout(500)

    // No-results empty state shows
    const noResults = page.locator('.page-empty')
    await expect(noResults).toBeVisible({ timeout: 3000 })
    await expect(noResults.locator('.page-empty__title')).toContainText(/匹配/)
  })

  // ── Test 4: Navigation to project detail ──────────────────────────
  test('clicking a project card navigates to project detail', async ({ page }) => {
    await mockProjects(page, 3)

    await page.goto('/#/projects', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Click first project card
    const firstCard = page.locator('.project-card-wrap').first()
    await expect(firstCard).toBeVisible({ timeout: 5000 })
    await firstCard.click()

    // URL should change to project detail (hash-based routing)
    await expect(page).toHaveURL(/#\/projects\/proj_e2e_1/, { timeout: 5000 })
  })

  // ── Test 5: Create dialog ─────────────────────────────────────────
  test('clicking "新建项目" opens the create dialog', async ({ page }) => {
    // Header "新建项目" button
    const createBtn = page.locator('.page-header__create')
    await expect(createBtn).toBeVisible({ timeout: 5000 })
    await createBtn.click()

    // Dialog appears
    const dialog = page.locator('.project-dialog')
    await expect(dialog).toBeVisible({ timeout: 3000 })
    await expect(dialog).toContainText('新建项目')

    // Dialog has input fields for name and description
    const fieldInputs = dialog.locator('input, textarea')
    await expect(fieldInputs.first()).toBeVisible()

    // Cancel button
    const cancelBtn = dialog.locator('button:has-text("取消")')
    await expect(cancelBtn).toBeVisible()

    // Create button
    const submitBtn = dialog.locator('button:has-text("创建")')
    await expect(submitBtn).toBeVisible()
  })
})
