import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { defineComponent, type Plugin } from 'vue'
import { QLayout, QPageContainer, QPage, QChip, QBtn, QIcon, QSpinnerDots, QTooltip, QInput } from 'quasar'
import HomePage from '../../pages/HomePage.vue'

// ── Stubs ───────────────────────────────────────────────────────────────────

const StubAgentPromptInput = defineComponent({
  name: 'AgentPromptInput',
  props: { draft: String, loading: Boolean, connected: Boolean, disabled: Boolean, attachments: Array, placeholder: String, hint: String },
  emits: ['update:draft', 'submit', 'abort', 'remove-attachment', 'attach-files'],
  template: '<div class="stub-input"><input :value="draft" @input="$emit(\'update:draft\', ($event.target as HTMLInputElement).value)" /><button @click="$emit(\'submit\', draft)">submit</button></div>',
})

const StubUILayout = defineComponent({
  name: 'UILayout',
  props: { view: String },
  template: '<div class="stub-uilayout"><slot /></div>',
})

const StubUILayoutHeader = defineComponent({
  name: 'UILayoutHeader',
  props: { bordered: Boolean },
  template: '<div class="stub-header"><slot /></div>',
})

const StubUILayoutPageContainer = defineComponent({
  name: 'UILayoutPageContainer',
  template: '<div class="stub-page-container"><slot /></div>',
})

const StubUILayoutPage = defineComponent({
  name: 'UILayoutPage',
  template: '<div class="stub-page" @scroll.passive="$emit(\'scroll\', $event)"><slot /></div>',
  emits: ['scroll'],
})

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: {
      'en-US': {
        common: { retry: 'Retry' },
        gallery: {
          heroTitle: 'Start Creating from Inspiration',
          heroSubtitle: 'Browse curated works.',
          homePlaceholder: 'Describe what you want...',
          homeHint: 'Text required.',
          allLoaded: 'All works loaded',
          empty: 'No works yet.',
          retry: 'Retry',
        },
      },
    },
  })
}

// ── Mock API ────────────────────────────────────────────────────────────────

const mockListGallery = vi.fn()

vi.mock('src/api/client', () => ({
  api: {
    listGallery: (...args: unknown[]) => mockListGallery(...args),
    createSession: vi.fn().mockResolvedValue({ id: 'ses_test' }),
    sendPrompt: vi.fn().mockResolvedValue({}),
  },
  GalleryCard: {} as never,
}))

async function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const i18n = makeI18n()
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', component: HomePage }],
  })
  await router.push('/')
  await router.isReady()

  return mount(HomePage, {    global: {
      plugins: [pinia, i18n, router] as Plugin[],
      components: {
        QLayout, QPageContainer, QPage, QChip, QBtn, QIcon, QSpinnerDots, QTooltip, QInput,
        UILayout: StubUILayout,
        UILayoutHeader: StubUILayoutHeader,
        UILayoutPageContainer: StubUILayoutPageContainer,
        UILayoutPage: StubUILayoutPage,
        AgentPromptInput: StubAgentPromptInput,
      },
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════

describe('HomePage', () => {
  beforeEach(() => {
    mockListGallery.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts and shows hero text', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    expect(wrapper.find('.home-page__hero-title').exists()).toBe(true)
    expect(wrapper.find('.home-page__hero-title').text()).toBe('Start Creating from Inspiration')
  })

  it('renders category chips', async () => {
    const wrapper = await mountPage()
    // Chips are in .home-page__chips inside the UILayoutHeader
    const chipsContainer = wrapper.find('.home-page__chips')
    expect(chipsContainer.exists()).toBe(true)
    // Should contain the 7 category chip elements
    const chipsHtml = chipsContainer.html()
    expect(chipsHtml).toContain('全部')
    expect(chipsHtml).toContain('海报')
    expect(chipsHtml).toContain('品牌')
  })

  it('shows loading skeleton initially', async () => {
    mockListGallery.mockReturnValue(new Promise(() => { /* never resolves */ }))
    const wrapper = await mountPage()
    await flushPromises()
    const skeletons = wrapper.findAll('.home-page__skeleton-card')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no works', async () => {
    mockListGallery.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.home-page__empty').exists()).toBe(true)
  })

  it('shows error state on API failure', async () => {
    mockListGallery.mockRejectedValue(new Error('Network error'))
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.home-page__error').exists()).toBe(true)
  })

  it('populates waterfall with cards', async () => {
    mockListGallery.mockResolvedValue({
      items: [
        { slug: 'w1', title: 'Work One', category: 'poster', tags: ['test'], thumbnailUrl: '/img.png' },
        { slug: 'w2', title: 'Work Two', category: 'scene', tags: ['flat'], thumbnailUrl: null },
      ],
      nextCursor: null,
      hasMore: false,
    })
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const cards = wrapper.findAll('.home-page__card')
    expect(cards.length).toBe(2)
    expect(cards[0]!.text()).toContain('Work One')
    expect(cards[1]!.text()).toContain('Work Two')
  })

  it('does not show prompt on cards', async () => {
    mockListGallery.mockResolvedValue({
      items: [
        { slug: 'w1', title: 'No Prompt', category: 'poster', tags: ['test'], thumbnailUrl: '/img.png' },
      ],
      nextCursor: null,
      hasMore: false,
    })
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    const card = wrapper.find('.home-page__card')
    // GalleryCard type doesn't include prompt — verified by structure
    expect(card.exists()).toBe(true)
    expect(card.text()).not.toContain('prompt')
  })
})
