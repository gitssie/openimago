import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AgentQuestion from '../../components/AgentQuestion.vue'
import enUS from '../../i18n/en-US/index'
import type { QuestionRequest } from '@opencode-ai/sdk/v2'

describe('AgentQuestion', () => {
  it('renders as an in-flow dock by default for redesigned workspace extras', () => {
    const wrapper = mountAgentQuestion()

    const dock = wrapper.get('.agent-question-dock')
    expect(dock.classes()).toContain('agent-question-dock--inline')
    expect(dock.classes()).not.toContain('agent-question-dock--popup')
  })

  it('can still render as an absolute popup when requested', () => {
    const wrapper = mountAgentQuestion({ placement: 'popup' })

    const dock = wrapper.get('.agent-question-dock')
    expect(dock.classes()).toContain('agent-question-dock--popup')
    expect(dock.classes()).not.toContain('agent-question-dock--inline')
  })
})

function mountAgentQuestion(props?: { placement?: 'popup' | 'inline' }) {
  return mount(AgentQuestion, {
    props: {
      request: makeQuestionRequest(),
      onReply: vi.fn().mockResolvedValue(undefined),
      onReject: vi.fn().mockResolvedValue(undefined),
      ...props,
    },
    global: {
      plugins: [createI18n({ locale: 'en-US', legacy: false, missingWarn: false, fallbackWarn: false, messages: { 'en-US': enUS } })],
      stubs: {
        QBtn: { template: '<button type="button"><slot /></button>' },
        QIcon: { template: '<span />' },
        QInput: { template: '<input />' },
      },
    },
  })
}

function makeQuestionRequest(): QuestionRequest {
  return {
    id: 'question-request',
    sessionID: 'session-id',
    questions: [
      {
        question: 'Choose an option',
        header: 'Choice',
        options: [
          { label: 'Option A', description: 'First option' },
          { label: 'Option B', description: 'Second option' },
        ],
      },
    ],
  }
}
