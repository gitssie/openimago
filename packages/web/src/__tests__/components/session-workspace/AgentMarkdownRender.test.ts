import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AgentMarkdownRender from '../../../components/session-workspace/AgentMarkdownRender.vue'

const renderMock = vi.hoisted(() => vi.fn(() => '<svg data-testid="mermaid-svg"></svg>'))
const initializeMock = vi.hoisted(() => vi.fn())

vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
    render: renderMock,
  },
}))

vi.mock('markstream-vue', () => ({
  MarkdownRender: {
    props: ['content', 'final'],
    template: `
      <div class="markdown-render">
        <pre v-if="content.startsWith('\`\`\`')"><code :class="'language-' + content.slice(3, content.indexOf('\\n'))">{{ content.split('\\n').slice(1, -1).join('\\n') }}</code></pre>
        <span v-else>{{ content }}</span>
      </div>
    `,
  },
}))

describe('AgentMarkdownRender', () => {
  afterEach(() => {
    renderMock.mockClear()
    initializeMock.mockClear()
  })

  it('renders final Mermaid fences as diagram containers instead of code blocks', async () => {
    const wrapper = mount(AgentMarkdownRender, {
      props: {
        content: '```mermaid\nflowchart TD\n  A --> B\n```',
        final: true,
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.agent-mermaid svg').exists()).toBe(true)
    })

    expect(wrapper.find('pre code.language-mermaid').exists()).toBe(false)
  })

  it('initializes Mermaid with transparent diagram backgrounds', async () => {
    const wrapper = mount(AgentMarkdownRender, {
      props: {
        content: '```mermaid\nflowchart TD\n  A --> B\n```',
        final: true,
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.agent-mermaid svg').exists()).toBe(true)
    })

    expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({
      themeVariables: expect.objectContaining({
        background: 'transparent',
        mainBkg: 'transparent',
      }),
    }))
  })

  it('keeps non-Mermaid fences as code blocks', () => {
    const wrapper = mount(AgentMarkdownRender, {
      props: {
        content: '```ts\nconst answer = 42\n```',
        final: true,
      },
    })

    expect(wrapper.find('.agent-mermaid').exists()).toBe(false)
    expect(wrapper.find('pre code').exists()).toBe(true)
    expect(wrapper.text()).toContain('const answer = 42')
  })

  it('leaves streaming Mermaid fences with MarkdownRender until content is final', () => {
    const wrapper = mount(AgentMarkdownRender, {
      props: {
        content: '```mermaid\nflowchart TD\n  A --',
        final: false,
      },
    })

    expect(wrapper.find('.agent-mermaid').exists()).toBe(false)
    expect(wrapper.text()).toContain('flowchart TD')
    expect(renderMock).not.toHaveBeenCalled()
  })

  it('renders Mermaid when a streaming block becomes final', async () => {
    const wrapper = mount(AgentMarkdownRender, {
      props: {
        content: '```mermaid\nflowchart TD\n  A --',
        final: false,
      },
    })

    await wrapper.setProps({
      content: '```mermaid\nflowchart TD\n  A --> B\n```',
      final: true,
    })

    await vi.waitFor(() => {
      expect(wrapper.find('.agent-mermaid svg').exists()).toBe(true)
    })

    expect(renderMock).toHaveBeenCalledWith(expect.stringMatching(/^agent-mermaid-/), 'flowchart TD\n  A --> B')
  })
})
