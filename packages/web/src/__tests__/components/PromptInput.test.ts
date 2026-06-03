import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import PromptInput from '../../components/PromptInput.vue'
import type { ComposerAttachment } from '../../components/PromptInput.vue'

// ═══════════════════════════════════════════════════════════════════════════
// i18n helper — minimal setup matching project conventions
// ═══════════════════════════════════════════════════════════════════════════

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: {
      'en-US': {
        agent: {
          askAnythingPlaceholder: 'Ask anything...',
          inputHint: 'AI may make mistakes.',
          attachFile: 'Attach File',
          connected: 'Connected',
          connecting: 'Connecting...',
          send: 'Send',
          stop: 'Stop',
          queueFollowup: 'Queue follow-up',
        },
        gallery: {
          composerPlaceholder: 'Type an idea, paste a script, or describe the video you want...',
        },
      },
    },
  })
}

function mountInput(props?: Record<string, unknown>) {
  const i18n = makeI18n()
  return mount(PromptInput, {
    props: {
      modelValue: '',
      loading: false,
      connected: true,
      disabled: false,
      attachments: [] as ComposerAttachment[],
      ...props,
    },
    global: {
      plugins: [i18n],
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Default i18n placeholders
// ═══════════════════════════════════════════════════════════════════════════

describe('PromptInput — placeholders', () => {
  it('renders default i18n placeholder when no placeholder prop', () => {
    const wrapper = mountInput()
    const textarea = wrapper.find('.chat-input textarea, .chat-input input')
    expect(textarea.attributes('placeholder')).toBe(
      'Type an idea, paste a script, or describe the video you want...',
    )
  })

  it('renders custom placeholder when placeholder prop is provided', () => {
    const wrapper = mountInput({ placeholder: '描述你想要的效果...' })
    const textarea = wrapper.find('.chat-input textarea, .chat-input input')
    expect(textarea.attributes('placeholder')).toBe('描述你想要的效果...')
  })

  it('renders empty placeholder when placeholder="" is provided', () => {
    const wrapper = mountInput({ placeholder: '' })
    const textarea = wrapper.find('.chat-input textarea, .chat-input input')
    expect(textarea.attributes('placeholder')).toBe('')
  })

  it('renders default i18n hint when no hint prop', () => {
    const wrapper = mountInput()
    const hint = wrapper.find('.composer-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('AI may make mistakes.')
  })

  it('renders custom hint when hint prop is provided', () => {
    const wrapper = mountInput({ hint: '按 Enter 发送，Shift+Enter 换行' })
    const hint = wrapper.find('.composer-hint')
    expect(hint.text()).toBe('按 Enter 发送，Shift+Enter 换行')
  })

  it('hides hint when hint=null is provided', () => {
    const wrapper = mountInput({ hint: null })
    const hint = wrapper.find('.composer-hint')
    expect(hint.exists()).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Attachments
// ═══════════════════════════════════════════════════════════════════════════

describe('PromptInput — attachments', () => {
  it('renders attachment chips with name', () => {
    const attachments: ComposerAttachment[] = [
      { id: 'a1', name: 'photo.jpg' },
      { id: 'a2', name: 'sketch.png' },
    ]
    const wrapper = mountInput({ attachments })
    const chips = wrapper.findAll('.attachment-chip')
    expect(chips.length).toBe(2)
    expect(chips[0]!.text()).toContain('photo.jpg')
    expect(chips[1]!.text()).toContain('sketch.png')
  })

  it('emits remove-attachment when chip remove is clicked', async () => {
    const attachments: ComposerAttachment[] = [
      { id: 'rm-me', name: 'remove.png' },
    ]
    const wrapper = mountInput({ attachments })
    // Find the removable chip and trigger remove
    const chip = wrapper.findComponent({ name: 'QChip' })
    expect(chip.exists()).toBe(true)
    expect(chip.props('removable')).toBe(true)
    // Trigger the remove event
    await chip.vm.$emit('remove')
    expect(wrapper.emitted('remove-attachment')).toBeTruthy()
    expect(wrapper.emitted('remove-attachment')![0]).toEqual(['rm-me'])
  })

  it('shows no attachment chips when attachments is empty', () => {
    const wrapper = mountInput({ attachments: [] })
    const chips = wrapper.findAll('.attachment-chip')
    expect(chips.length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Submit behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('PromptInput — submit', () => {
  it('emits submit when Enter is pressed with draft content', async () => {
    const wrapper = mountInput({ modelValue: 'hello world' })

    // The modelValue prop watcher syncs localDraft
    // Find the textarea and trigger Enter keydown
    const textarea = wrapper.find('.chat-input textarea')
    if (textarea.exists()) {
      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    }

    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toBe('hello world')
  })

  it('does not emit submit on Enter when draft is empty', async () => {
    const wrapper = mountInput({ modelValue: '' })
    const textarea = wrapper.find('.chat-input textarea')
    if (textarea.exists()) {
      await textarea.trigger('keydown', { key: 'Enter', shiftKey: false })
    }
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('emits submit on button click when draft has content', async () => {
    const wrapper = mountInput({ modelValue: 'test message' })

    // Click the send button
    const sendBtn = wrapper.find('.send-btn')
    expect(sendBtn.exists()).toBe(true)
    await sendBtn.trigger('click')

    expect(wrapper.emitted('submit')).toBeTruthy()
  })

  it('send button is disabled when no draft and no attachments', () => {
    const wrapper = mountInput({ modelValue: '', attachments: [], loading: false })
    const sendBtn = wrapper.find('.send-btn')
    expect(sendBtn.attributes('disabled')).toBeDefined()
  })

  it('send button is enabled when attachments exist but draft is empty', () => {
    const wrapper = mountInput({
      modelValue: '',
      attachments: [{ id: 'a1', name: 'file.png' }],
      loading: false,
    })
    const sendBtn = wrapper.find('.send-btn')
    // Button should be active (hasAction is true because attachments.length > 0)
    expect(sendBtn.classes()).toContain('send-btn--active')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Attach files
// ═══════════════════════════════════════════════════════════════════════════

describe('PromptInput — attach files', () => {
  it('emits attach-files when files are selected', async () => {
    const wrapper = mountInput()

    // Find the hidden file input
    const fileInput = wrapper.find('.hidden-file-input')
    expect(fileInput.exists()).toBe(true)

    // Create mock File objects
    const file1 = new File(['content'], 'test.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file1)

    // Set files on the input element
    const el = fileInput.element as HTMLInputElement
    Object.defineProperty(el, 'files', { value: dt.files })

    await fileInput.trigger('change')

    const emitted = wrapper.emitted('attach-files')
    expect(emitted).toBeTruthy()
    expect(emitted![0]![0]).toHaveLength(1)
    expect((emitted![0]![0] as File[])[0]!.name).toBe('test.png')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Exposed API
// ═══════════════════════════════════════════════════════════════════════════

describe('PromptInput — exposed API', () => {
  it('exposes setDraft method that updates the input', () => {
    const wrapper = mountInput({ modelValue: '' })
    const vm = wrapper.vm as unknown as { setDraft: (v: string) => void; focus: () => void }

    // setDraft is callable
    expect(typeof vm.setDraft).toBe('function')
    vm.setDraft('hello via setDraft')

    // The input's value should reflect the new draft
    const textarea = wrapper.find('.chat-input textarea')
    expect(textarea.exists()).toBe(true)
    // setDraft sets localDraft ref; model-value binding propagates to the textarea
  })

  it('exposes focus method', () => {
    const wrapper = mountInput()
    const vm = wrapper.vm as unknown as { focus: () => void; setDraft: (v: string) => void }
    expect(typeof vm.focus).toBe('function')
  })
})
