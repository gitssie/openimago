import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import { defineComponent, h, type Plugin, type Component } from 'vue'
import { QLayout, QPageContainer, QPage, QBtn, QIcon, QTooltip } from 'quasar'

// ── Mock home section components BEFORE importing HomePage (which imports them). ──
// Each stub is inlined inside the factory so vi.mock's hoisting doesn't trip on
// the const declarations.

vi.mock('../../components/home/HomeHero.vue', () => ({
  default: { name: 'HomeHero', template: '<div class="stub-hero" />' },
}))

vi.mock('../../components/PromptInput.vue', () => ({
  default: {
    name: 'PromptInput',
    props: ['modelValue', 'loading', 'connected', 'disabled', 'attachments', 'placeholder', 'hint'],
    emits: ['update:modelValue', 'submit', 'abort', 'remove-attachment', 'attach-files'],
    template: `<div class="stub-composer">
      <input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />
      <button :disabled="!modelValue" @click="$emit('submit', modelValue)">send</button>
    </div>`,
  },
}))

vi.mock('../../components/home/HomeSkills.vue', () => ({
  default: { name: 'HomeSkills', template: '<div class="stub-skills" />' },
}))

vi.mock('../../components/home/HomeTV.vue', () => ({
  default: {
    name: 'HomeTV',
    props: ['works', 'loading'],
    emits: ['play'],
    template: `<div class="stub-tv">
      <div v-for="w in works" :key="w.slug" class="stub-tv__card">{{ w.title }}</div>
    </div>`,
  },
}))

vi.mock('../../components/home/HomeRecommended.vue', () => ({
  default: {
    name: 'HomeRecommended',
    props: ['works', 'loading'],
    emits: ['play'],
    template: `<div class="stub-recommended">
      <div v-for="w in works" :key="w.slug" class="stub-recommended__card">{{ w.title }}</div>
    </div>`,
  },
}))

// Import AFTER the mocks are registered so the SFC gets the stubs.
const HomePage = (await import('../../pages/HomePage.vue')).default

// ── i18n ───────────────────────────────────────────────────────────────────

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: {
      'en-US': {
        common: { retry: 'Retry' },
        gallery: {
          homeLoadingFailed: 'Failed to load',
          composerRequired: 'Please enter your idea',
          sessionCreateFailed: 'Failed to create session',
          promptSendFailed: 'Failed to send prompt',
        },
      },
    },
  })
}

// ── Mock API ────────────────────────────────────────────────────────────────

const mockListGallery = vi.fn()
const mockSendPrompt = vi.fn().mockResolvedValue({})
const mockUploadTemp = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    listGallery: (...args: unknown[]) => mockListGallery(...args),
    createSession: vi.fn().mockResolvedValue({ id: 'ses_test' }),
    sendPrompt: (...args: unknown[]) => mockSendPrompt(...args),
    uploadTemp: (...args: unknown[]) => mockUploadTemp(...args),
  },
  GalleryCard: {} as never,
}))

// ── Mount helper ───────────────────────────────────────────────────────────

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

  /**
   * QPage requires QLayout as an ancestor; without it Quasar renders nothing.
   * Wrap HomePage in QLayout + QPageContainer so the page renders.
   */
  const Wrapper = defineComponent({
    components: { QLayout, QPageContainer },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () =>
        h(QPageContainer, () => h(HomePage as Component)),
      )
    },
  })

  return mount(Wrapper, {
    global: {
      plugins: [pinia, i18n, router] as Plugin[],
      components: { QLayout, QPageContainer, QPage, QBtn, QIcon, QTooltip },
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

  it('mounts and shows all section stubs', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    expect(wrapper.find('.stub-hero').exists()).toBe(true)
    expect(wrapper.find('.stub-composer').exists()).toBe(true)
    expect(wrapper.find('.stub-skills').exists()).toBe(true)
    expect(wrapper.find('.stub-tv').exists()).toBe(true)
    expect(wrapper.find('.stub-recommended').exists()).toBe(true)
  })

  it('passes works from API to TV section', async () => {
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
    const cards = wrapper.findAll('.stub-tv__card')
    expect(cards.length).toBe(2)
    expect(cards[0]!.text()).toBe('Work One')
    expect(cards[1]!.text()).toBe('Work Two')
  })

  it('shows error state on API failure', async () => {
    mockListGallery.mockRejectedValue(new Error('Network error'))
    const wrapper = await mountPage()
    await flushPromises()
    await flushPromises()
    expect(wrapper.find('.home-page__error').exists()).toBe(true)
  })

  it('sends attachments array instead of metadata.assetIds on submit', async () => {
    mockUploadTemp.mockResolvedValue({
      batchId: 'batch_01',
      attachments: [
        { id: 'tmp_001', filename: 'test.png', mimeType: 'image/png', size: 100, status: 'pending' },
        { id: 'tmp_002', filename: 'ref.jpg', mimeType: 'image/jpeg', size: 200, status: 'pending' },
      ],
    })

    const wrapper = await mountPage()
    await flushPromises()

    // Find the PromptInput stub component
    const promptInput = wrapper.findComponent({ name: 'PromptInput' })

    // Simulate file selection
    const testFile = new File(['fake'], 'test.png', { type: 'image/png' })
    const testFile2 = new File(['fake2'], 'ref.jpg', { type: 'image/jpeg' })
    promptInput.vm.$emit('attach-files', [testFile, testFile2])
    await flushPromises()
    await flushPromises()

    // Simulate submit
    promptInput.vm.$emit('submit', 'generate a video')
    await flushPromises()
    await flushPromises()

    // Verify sendPrompt was called with attachments, not metadata.assetIds
    expect(mockSendPrompt).toHaveBeenCalled()
    const sendPromptCall = mockSendPrompt.mock.calls[0]!
    // args: sessionId, prompt, meta, attachments
    expect(sendPromptCall[1]).toBe('generate a video')
    expect(sendPromptCall[3]).toEqual([
      { id: 'tmp_001', scope: 'temporary', filename: 'test.png', mime: 'image/png' },
      { id: 'tmp_002', scope: 'temporary', filename: 'ref.jpg', mime: 'image/jpeg' },
    ])
    // metadata should not contain assetIds
    const meta = sendPromptCall[2] as Record<string, unknown>
    expect(meta?.assetIds).toBeUndefined()
  })
})
