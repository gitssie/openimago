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
// Mock gallery items
// ════════════════════════════════════════════════════════════════
function makeGalleryItem(i: number) {
  return {
    slug: `work-${i}`,
    title: `Gallery Item ${i}`,
    category: i % 3 === 0 ? 'short' : i % 3 === 1 ? 'tutorial' : 'mv',
    tags: i % 2 === 0 ? ['AI', 'creative'] : ['cinematic'],
    thumbnailUrl: `https://picsum.photos/seed/w${i}/400/225`,
    subtitle: `Subtitle ${i}`,
    subtitleZh: `中文副标题 ${i}`,
    duration: `${(i % 5) + 1}:${String((i * 17) % 60).padStart(2, '0')}`,
    resolution: i % 2 === 0 ? '4K' : '1080p',
    creator: `creator-${i % 5}`,
    categoryLabel: i % 3 === 0 ? '短片' : i % 3 === 1 ? '教程' : 'MV',
    aspect: (['wide', 'square', 'tall'] as const)[i % 3],
  }
}

function mockGallery(page: import('@playwright/test').Page, count = 15) {
  const items = Array.from({ length: count }, (_, i) => makeGalleryItem(i + 1))
  return mockApi(page, '/api/platform/gallery', {
    items,
    nextCursor: count > 10 ? 'cursor-10' : null,
    hasMore: count > 10,
  })
}

// ════════════════════════════════════════════════════════════════

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(seedAuthScript())
    await mockGallery(page, 0) // default empty — individual tests override
    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  })

  // ── Test 1: Hero area ────────────────────────────────────────────
  test('hero section shows title, subtitle, and tagline', async ({ page }) => {
    const hero = page.locator('.home-hero')
    await expect(hero).toBeVisible({ timeout: 5000 })

    // Title has prefix + accent spans inside h1
    await expect(hero.locator('.home-hero__title-prefix')).toBeVisible()
    await expect(hero.locator('.home-hero__title-accent')).toBeVisible()

    // Subtitle and tagline
    await expect(hero.locator('.home-hero__subtitle')).toBeVisible()
    await expect(hero.locator('.home-hero__tagline')).toBeVisible()
  })

  // ── Test 2: PromptInput ──────────────────────────────────────────
  test('composer input and plus button with ImagePickerPopup exist', async ({ page }) => {
    // The PromptInput component should be visible
    const composer = page.locator('.prompt-input')
    await expect(composer).toBeVisible({ timeout: 5000 })

    // Plus button exists (contains ImagePickerPopup inside)
    const plusBtn = composer.locator('.prompt-input__icon-btn').first()
    await expect(plusBtn).toBeVisible()

    // Text input exists
    const textInput = composer.locator('textarea, input[type="text"]').first()
    await expect(textInput).toBeVisible()
  })

  // ── Test 3: Skills area ──────────────────────────────────────────
  test('skills section shows 5 skill cards', async ({ page }) => {
    const section = page.locator('.home-skills')
    await expect(section).toBeVisible({ timeout: 5000 })

    const cards = section.locator('.home-skills__card')
    await expect(cards).toHaveCount(5)

    // Verify skill names
    const skillNames = ['脚本生成', '镜头设计', '分镜生成', '视频生成', '智能剪辑']
    for (let i = 0; i < skillNames.length; i++) {
      await expect(cards.nth(i).locator('.home-skills__name')).toHaveText(skillNames[i]!)
    }
  })

  // ── Test 3b: Skill card click interaction ────────────────────────
  test('clicking a skill card does not throw errors', async ({ page }) => {
    await mockGallery(page, 5)
    // Reload with gallery data
    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

    const skillCard = page.locator('.home-skills__card').first()
    await expect(skillCard).toBeVisible({ timeout: 5000 })

    // Click the card — should trigger onSkillSelect without errors
    await skillCard.click()
    await page.waitForTimeout(500)

    // Page should still have no error section visible after click
    await expect(page.locator('.home-page__error')).toHaveCount(0)
  })

  // ── Test 4: HomeTV empty state ───────────────────────────────────
  test('HomeTV shows empty state when no works available', async ({ page }) => {
    // Default beforeEach already mocks empty gallery
    const empty = page.locator('.home-tv__empty')
    await expect(empty).toBeVisible({ timeout: 8000 })
    await expect(empty).toContainText(/暂无|empty/i)
  })

  // ── Test 5: HomeTV with works ────────────────────────────────────
  test('HomeTV renders work cards and tab switching works', async ({ page }) => {
    await mockGallery(page, 10)

    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Work cards should appear
    const cards = page.locator('.home-work-card')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })

    // Tabs are visible
    const tabs = page.locator('.home-tv__tab')
    await expect(tabs.first()).toBeVisible()
    await expect(tabs).toHaveCount(6) // all, short, tutorial, case, mv, tvc

    // Click a tab — it should become active
    const shortTab = tabs.nth(1) // "短片" tab
    await shortTab.click()
    await expect(shortTab).toHaveClass(/is-active/)
  })

  // ── Test 6: HomeTV pagination ────────────────────────────────────
  test('HomeTV shows prev/next navigation with multiple pages', async ({ page }) => {
    // 11 items = ceil(11/5) = 3 pages
    await mockGallery(page, 11)

    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Navigation buttons appear when pageCount > 1
    await expect(page.locator('.home-tv__nav--prev')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.home-tv__nav--next')).toBeVisible()

    // Dots indicator shows pages
    const dots = page.locator('.home-tv__dot')
    await expect(dots).toHaveCount(3)

    // Click next → featured item changes
    const featuredTitle = page.locator('.home-tv__featured .home-work-card__title').first()
    const firstTitle = await featuredTitle.textContent()

    await page.locator('.home-tv__nav--next').click()
    await page.waitForTimeout(500)

    const secondTitle = await featuredTitle.textContent()
    expect(secondTitle).not.toBe(firstTitle)
  })

  // ── Test 7: HomeRecommended ──────────────────────────────────────
  test('HomeRecommended section shows work cards', async ({ page }) => {
    await mockGallery(page, 15)

    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Recommended section heading
    const section = page.locator('.home-recommended')
    await expect(section).toBeVisible({ timeout: 10000 })
    await expect(section.locator('.home-recommended__title')).toBeVisible()

    // Work cards should render
    const recCards = section.locator('.home-work-card')
    await expect(recCards.first()).toBeVisible({ timeout: 8000 })

    // "查看更多" link
    await expect(section.locator('.home-recommended__more')).toBeVisible()
  })

  // ── Test 8: Error state ──────────────────────────────────────────
  test('shows error message and retry button when gallery API fails', async ({ page }) => {
    // Override route to return an error
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    const escaped = '/api/platform/gallery'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await page.route(new RegExp(`${escaped}(\\?.*)?$`), (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVER_ERROR', message: 'Something went wrong' },
        }),
      })
    })

    await page.goto('/#/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Error section appears
    const errorSection = page.locator('.home-page__error')
    await expect(errorSection).toBeVisible({ timeout: 10000 })

    // Error text visible
    await expect(errorSection).toContainText(/Something went wrong|加载失败/)

    // Retry button exists
    await expect(errorSection.locator('button')).toBeVisible()
  })
})
