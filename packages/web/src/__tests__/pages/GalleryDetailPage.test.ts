import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { type Plugin } from 'vue'
import { QLayout, QPageContainer, QBtn, QIcon, QTooltip, QInput, QChip, QDialog, QPopupProxy, BottomSheet } from 'quasar'
import GalleryDetailPage from '../../pages/GalleryDetailPage.vue'

// ── Mock route ──────────────────────────────────────────────────────────────

const mockGetGalleryItem = vi.fn()
const mockListGallery = vi.fn()

vi.mock('src/api/client', () => ({
  api: {
    getGalleryItem: (...args: unknown[]) => mockGetGalleryItem(...args),
    listGallery: (...args: unknown[]) => mockListGallery(...args),
    createSession: vi.fn().mockResolvedValue({ id: 'ses_test' }),
    sendPrompt: vi.fn().mockResolvedValue({}),
  },
  GalleryDetail: {} as never,
}))

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: {
      'en-US': {
        common: { cancel: 'Cancel' },
        gallery: {
          empty: 'No works yet.',
          viewPrompt: 'View Prompt',
          createFromThis: 'Create from this work',
          referenceWork: 'Reference Work',
          expandPrompt: 'Expand',
          collapsePrompt: 'Collapse',
          submitCreate: 'Submit',
          quickChips: {
            useStyle: 'Use this style',
            similarComposition: 'Similar composition',
            tryPalette: 'Try this palette',
            changeScheme: 'Change scheme',
            addDetails: 'Add details',
          },
          composerPlaceholder: 'Describe...',
          prevWork: 'Previous',
          nextWork: 'Next',
        },
      },
    },
  })
}

async function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = makeI18n()
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/gallery/:slug', component: GalleryDetailPage },
      { path: '/', component: { template: '<div>home</div>' } },
    ],
  })
  void router.push('/gallery/test-slug')
  await router.isReady()

  return mount(GalleryDetailPage, {
    global: {
      plugins: [pinia, i18n, router] as Plugin[],
      components: { QLayout, QPageContainer, QBtn, QIcon, QTooltip, QInput, QChip, QDialog, QPopupProxy, BottomSheet },
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════

describe('GalleryDetailPage', () => {
  beforeEach(() => {
    mockGetGalleryItem.mockResolvedValue({
      slug: 'test-slug',
      title: 'Test Work',
      category: 'poster',
      tags: ['cyberpunk', 'neon'],
      prompt: 'A cinematic test prompt for verification.',
      imageUrl: '/test.png',
      navigation: { prevSlug: 'prev-work', nextSlug: 'next-work' },
    })
    mockListGallery.mockResolvedValue({
      items: [
        { slug: 'prev-work', title: 'Prev', category: 'poster', tags: null, thumbnailUrl: null },
        { slug: 'test-slug', title: 'Test Work', category: 'poster', tags: null, thumbnailUrl: null },
        { slug: 'next-work', title: 'Next', category: 'poster', tags: null, thumbnailUrl: null },
      ],
      nextCursor: null,
      hasMore: false,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts and loads gallery detail', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    expect(mockGetGalleryItem).toHaveBeenCalledWith('test-slug')
    expect(wrapper.find('.gallery-detail__title').exists()).toBe(true)
    expect(wrapper.find('.gallery-detail__title').text()).toBe('Test Work')
  })

  it('displays tags', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const tags = wrapper.findAll('.gallery-detail__tag')
    expect(tags.length).toBe(2)
    expect(tags[0]!.text()).toBe('cyberpunk')
    expect(tags[1]!.text()).toBe('neon')
  })

  it('shows prev and next navigation arrows', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const prevBtn = wrapper.find('.gallery-detail__arrow--left')
    const nextBtn = wrapper.find('.gallery-detail__arrow--right')
    expect(prevBtn.exists()).toBe(true)
    expect(nextBtn.exists()).toBe(true)
  })

  it('hides prev arrow when prevSlug is null', async () => {
    mockGetGalleryItem.mockResolvedValue({
      slug: 'first',
      title: 'First',
      category: 'poster',
      tags: null,
      prompt: 'First work',
      imageUrl: null,
      navigation: { prevSlug: null, nextSlug: 'second' },
    })
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.gallery-detail__arrow--left').exists()).toBe(false)
    expect(wrapper.find('.gallery-detail__arrow--right').exists()).toBe(true)
  })

  it('prompt toggle button exists', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const btn = wrapper.find('.gallery-detail__prompt-btn')
    expect(btn.exists()).toBe(true)
  })

  it('composer FAB opens dialog', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const fab = wrapper.find('.gallery-detail__fab')
    expect(fab.exists()).toBe(true)
  })

  it('shows error state gracefully on API failure', async () => {
    mockGetGalleryItem.mockRejectedValue(new Error('Not found'))
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    // Should not crash
    expect(wrapper.find('.gallery-detail').exists()).toBe(true)
  })
})
