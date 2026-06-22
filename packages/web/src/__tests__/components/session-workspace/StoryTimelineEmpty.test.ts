import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StoryTimelineEmpty from '../../../components/session-workspace/StoryTimelineEmpty.vue'

// OiIcon renders raw SVG via v-html and is irrelevant to this component's
// behavior, so stub it to keep the test focused on the empty-state variants.
const mountOptions = {
  global: { stubs: { OiIcon: true } },
} as const

describe('StoryTimelineEmpty — hasEpisodes=true', () => {
  it('renders the "前往概览选择剧集" CTA button', () => {
    const wrapper = mount(StoryTimelineEmpty, {
      ...mountOptions,
      props: { hasEpisodes: true },
    })

    const cta = wrapper.find('button.section-empty__cta')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('前往概览选择剧集')
  })

  it('emits go-to-overview when the CTA is clicked', async () => {
    const wrapper = mount(StoryTimelineEmpty, {
      ...mountOptions,
      props: { hasEpisodes: true },
    })

    await wrapper.find('button.section-empty__cta').trigger('click')

    expect(wrapper.emitted('go-to-overview')).toHaveLength(1)
  })
})

describe('StoryTimelineEmpty — hasEpisodes=false', () => {
  it('does not render the CTA button', () => {
    const wrapper = mount(StoryTimelineEmpty, {
      ...mountOptions,
      props: { hasEpisodes: false },
    })

    expect(wrapper.find('button.section-empty__cta').exists()).toBe(false)
  })

  it('shows the "尚无剧集" copy', () => {
    const wrapper = mount(StoryTimelineEmpty, {
      ...mountOptions,
      props: { hasEpisodes: false },
    })

    expect(wrapper.text()).toContain('尚无剧集')
  })
})
