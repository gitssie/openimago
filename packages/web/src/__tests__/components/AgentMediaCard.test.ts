import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentMediaCard from '../../components/AgentMediaCard.vue'
import type { MediaToolOutputV1 } from '../../services/media'

const makeImageMedia = (overrides?: Partial<MediaToolOutputV1['result']>): MediaToolOutputV1 => ({
  version: 1 as const,
  kind: 'image',
  status: 'completed' as const,
  result: {
    workspaceFileId: 'wf_img',
    mime: 'image/png',
    access: {
      preview: { href: 'https://example.com/img.png' },
    },
    ...overrides,
  },
})

const makeVideoMedia = (overrides?: Partial<MediaToolOutputV1['result']>): MediaToolOutputV1 => ({
  version: 1 as const,
  kind: 'video',
  status: 'completed' as const,
  result: {
    workspaceFileId: 'wf_vid',
    mime: 'video/mp4',
    access: {
      preview: { href: '/media/video.mp4' },
      poster: { href: '/media/poster.webp' },
    },
    ...overrides,
  },
})

const makeAudioMedia = (overrides?: Partial<MediaToolOutputV1['result']>): MediaToolOutputV1 => ({
  version: 1 as const,
  kind: 'audio',
  status: 'completed' as const,
  result: {
    workspaceFileId: 'wf_aud',
    mime: 'audio/mpeg',
    access: {
      preview: { href: 'data:audio/mpeg;base64,...' },
    },
    ...overrides,
  },
})

describe('AgentMediaCard', () => {
  // ── Image rendering ─────────────────────────────────────────────────────────

  it('renders an img element for image media', () => {
    const media = makeImageMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/img.png')
  })

  it('applies width and height attributes from media result', () => {
    const media = makeImageMedia({ width: 1024, height: 1024 })
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const img = wrapper.find('img')
    expect(img.attributes('width')).toBe('1024')
    expect(img.attributes('height')).toBe('1024')
  })

  it('does not set explicit dimensions when not provided', () => {
    const media = makeImageMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const img = wrapper.find('img')
    expect(img.attributes('width')).toBeUndefined()
    expect(img.attributes('height')).toBeUndefined()
  })

  it('renders filename caption below image', () => {
    const media = makeImageMedia({ filename: 'cyberpunk-street.png' })
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    expect(wrapper.text()).toContain('cyberpunk-street.png')
  })

  // ── Video rendering ─────────────────────────────────────────────────────────

  it('renders a video element for video media', () => {
    const media = makeVideoMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const video = wrapper.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('controls')).toBe('')
  })

  it('sets poster attribute when poster access locator is present', () => {
    const media = makeVideoMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const video = wrapper.find('video')
    expect(video.attributes('poster')).toBe('/media/poster.webp')
  })

  it('does not set poster when poster access locator is absent', () => {
    const media = makeVideoMedia()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (media.result.access as any).poster
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const video = wrapper.find('video')
    expect(video.attributes('poster')).toBeUndefined()
  })

  it('renders source element with preview href', () => {
    const media = makeVideoMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const source = wrapper.find('video source')
    expect(source.exists()).toBe(true)
    expect(source.attributes('src')).toBe('/media/video.mp4')
  })

  // ── Audio rendering ─────────────────────────────────────────────────────────

  it('renders an audio element for audio media', () => {
    const media = makeAudioMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const audio = wrapper.find('audio')
    expect(audio.exists()).toBe(true)
    expect(audio.attributes('controls')).toBe('')
  })

  it('renders source element with preview href for audio', () => {
    const media = makeAudioMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const source = wrapper.find('audio source')
    expect(source.exists()).toBe(true)
    expect(source.attributes('src')).toBe('data:audio/mpeg;base64,...')
  })

  // ── Common media card structure ─────────────────────────────────────────────

  it('renders a root element with class media-card', () => {
    const media = makeImageMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    expect(wrapper.find('.media-card').exists()).toBe(true)
  })

  it('renders kind badge showing the media type', () => {
    const media = makeImageMedia()
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    const badge = wrapper.find('.media-card__kind-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text().toLowerCase()).toContain('image')
  })

  // ── Error boundary ──────────────────────────────────────────────────────────

  it('renders fallback when preview href is empty string', () => {
    const media = makeImageMedia({
      access: { preview: { href: '' } },
    })
    const wrapper = mount(AgentMediaCard, {
      props: { media },
    })
    // Should still render card structure even with empty href
    expect(wrapper.find('.media-card').exists()).toBe(true)
  })
})
