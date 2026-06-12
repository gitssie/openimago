import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import ChatInputDock from 'src/components/workspace/ChatInputDock.vue'
import ImagePickerPopup from 'src/components/ImagePickerPopup.vue'
import PromptInput from 'src/components/PromptInput.vue'

function makeI18n() {
  return createI18n({
    locale: 'en-US',
    legacy: false,
    messages: {
      'en-US': {
        agent: {
          attachFile: 'Attach File',
          connected: 'Connected',
          connecting: 'Connecting...',
          inputHint: 'AI may make mistakes.',
          queueFollowup: 'Queue follow-up',
          send: 'Send',
          stop: 'Stop',
        },
        gallery: {
          composerPlaceholder: 'Type an idea, paste a script, or describe the video you want...',
          typeAudio: '音频',
          typeImage: '图片',
          typeText: '文本',
          typeVideo: '视频',
        },
      },
    },
  })
}

function mountDock(props?: Partial<InstanceType<typeof ChatInputDock>['$props']>) {
  return mount(ChatInputDock, {
    props: {
      ...props,
    },
    global: {
      plugins: [makeI18n()],
      stubs: {
        OiIcon: { props: ['name'], template: '<span class="oi-icon-stub">{{ name }}</span>' },
      },
    },
  })
}

describe('ChatInputDock', () => {
  it('renders default controls inside PromptInput instead of a separate compose row', () => {
    const wrapper = mountDock({ modelLabel: 'GPT-4o Mini' })

    expect(wrapper.find('.chat-input-dock__compose').exists()).toBe(false)

    const promptInput = wrapper.findComponent(PromptInput)
    expect(promptInput.exists()).toBe(true)

    const leadingControls = promptInput.findAll('.prompt-input__bar-left .prompt-input__icon-btn, .prompt-input__bar-left .prompt-input__select')
    expect(leadingControls).toHaveLength(4)
    expect(leadingControls[0]?.attributes('aria-label')).toBe('添加附件')
    expect(promptInput.findComponent(ImagePickerPopup).exists()).toBe(true)
    expect(promptInput.text()).toContain('GPT-4o Mini')
    expect(promptInput.text()).toContain('Skill')
    expect(promptInput.text()).toContain('元素')
  })

  it('passes the placeholder prop through to PromptInput', () => {
    const wrapper = mountDock({ placeholder: 'Describe a workspace task…' })

    expect(wrapper.findComponent(PromptInput).props('placeholder')).toBe('Describe a workspace task…')
  })

  it.each([
    ['image', 'image/*'],
    ['audio', 'audio/*'],
    ['video', 'video/*'],
    ['text', 'text/plain,application/pdf,.md,.csv,.json'],
  ] as const)('opens the %s file picker from the upload type menu', (type, accept) => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mountDock()
    const picker = wrapper.findComponent(ImagePickerPopup)

    picker.vm.$emit('select', type)

    const fileInput = wrapper.find<HTMLInputElement>('input[type="file"]')
    expect(fileInput.element.accept).toBe(accept)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('preserves submit, abort, attach, and remove events from PromptInput', () => {
    const file = new File(['content'], 'image.png', { type: 'image/png' })
    const wrapper = mountDock({ loading: true })
    const promptInput = wrapper.findComponent(PromptInput)

    promptInput.vm.$emit('submit', 'hello')
    promptInput.vm.$emit('abort')
    promptInput.vm.$emit('attach-files', [file])
    promptInput.vm.$emit('remove-attachment', 'att_1')

    expect(wrapper.emitted('submit')).toEqual([['hello']])
    expect(wrapper.emitted('abort')).toHaveLength(1)
    expect(wrapper.emitted('attach-files')).toEqual([[[file]]])
    expect(wrapper.emitted('remove-attachment')).toEqual([['att_1']])
  })
})
