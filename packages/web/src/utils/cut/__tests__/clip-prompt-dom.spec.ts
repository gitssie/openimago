import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMentionChip,
  serializePromptEl,
  hydratePromptEl,
  MENTION_CHIP_CLASS,
} from '../clip-prompt-dom'
import { elementRefToken } from '../clip-element-mention'

// openimago-212y: the ClipGenerateDialog prompt is a contenteditable region with inline
// @-mention chips. These pure DOM transforms are the serialize/hydrate roundtrip the
// component depends on; the cursor/selection insertion is browser-only and lives in the
// component (not tested here).

const JIANG = elementRefToken('Jiang Cheng') // Element_Jiang_Cheng_ref_img

function makeRoot(): HTMLElement {
  return document.createElement('div')
}

describe('createMentionChip', () => {
  it('builds an atomic (non-editable) chip carrying token + refImg in data-*', () => {
    const chip = createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '/mock/a.jpg' })
    expect(chip.classList.contains(MENTION_CHIP_CLASS)).toBe(true)
    expect(chip.getAttribute('contenteditable')).toBe('false')
    expect(chip.dataset.token).toBe(JIANG)
    expect(chip.dataset.refimg).toBe('/mock/a.jpg')
    expect(chip.querySelector('img')?.getAttribute('src')).toBe('/mock/a.jpg')
    expect(chip.querySelector('.mention-chip__name')?.textContent).toBe('Jiang Cheng')
  })

  it('renders a text-only chip (no avatar img) when refImg is empty', () => {
    const chip = createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '' })
    expect(chip.querySelector('img')).toBeNull()
    expect(chip.querySelector('.mention-chip__name')?.textContent).toBe('Jiang Cheng')
  })
})

describe('serializePromptEl', () => {
  it('returns empty for a null / empty root', () => {
    expect(serializePromptEl(null)).toEqual({ text: '', elementRefImgs: [] })
    expect(serializePromptEl(makeRoot())).toEqual({ text: '', elementRefImgs: [] })
  })

  it('embeds each chip token in the text and collects its ref image', () => {
    const root = makeRoot()
    root.appendChild(document.createTextNode('江城 '))
    root.appendChild(createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '/mock/a.jpg' }))
    root.appendChild(document.createTextNode(' 坐在教室'))

    const { text, elementRefImgs } = serializePromptEl(root)
    expect(text).toContain(JIANG)
    expect(text).toContain('江城')
    expect(text).toContain('坐在教室')
    expect(elementRefImgs).toEqual(['/mock/a.jpg'])
  })

  it('de-duplicates repeated ref images across multiple chips', () => {
    const root = makeRoot()
    root.appendChild(createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '/mock/a.jpg' }))
    root.appendChild(createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '/mock/a.jpg' }))
    expect(serializePromptEl(root).elementRefImgs).toEqual(['/mock/a.jpg'])
  })

  it('ignores a chip with no ref image in the image list but keeps its token', () => {
    const root = makeRoot()
    root.appendChild(createMentionChip({ token: JIANG, label: 'Jiang Cheng', refImg: '' }))
    const { text, elementRefImgs } = serializePromptEl(root)
    expect(text).toContain(JIANG)
    expect(elementRefImgs).toEqual([])
  })
})

describe('hydratePromptEl', () => {
  it('reconstructs text nodes interleaved with chips from a tokenized prompt', () => {
    const root = makeRoot()
    hydratePromptEl(root, `江城 ${JIANG} 坐在教室`, () => '/mock/a.jpg')

    const chips = root.querySelectorAll(`.${MENTION_CHIP_CLASS}`)
    expect(chips.length).toBe(1)
    expect((chips[0] as HTMLElement).dataset.token).toBe(JIANG)
    expect(root.textContent).toContain('江城')
    expect(root.textContent).toContain('坐在教室')
  })

  it('clears prior content on each hydrate (idempotent re-seed)', () => {
    const root = makeRoot()
    root.appendChild(document.createTextNode('stale'))
    hydratePromptEl(root, 'fresh text no tokens', () => '')
    expect(root.textContent).toBe('fresh text no tokens')
    expect(root.querySelectorAll(`.${MENTION_CHIP_CLASS}`).length).toBe(0)
  })

  it('roundtrips: hydrate(prompt) → serialize recovers the token + ref image', () => {
    const root = makeRoot()
    const prompt = `江城 ${JIANG} 坐在教室靠窗座位`
    hydratePromptEl(root, prompt, () => '/mock/a.jpg')

    const { text, elementRefImgs } = serializePromptEl(root)
    expect(text.replace(/\s+/g, ' ')).toBe(prompt.replace(/\s+/g, ' '))
    expect(elementRefImgs).toEqual(['/mock/a.jpg'])
  })

  it('handles a token at the very start and end of the prompt', () => {
    const root = makeRoot()
    hydratePromptEl(root, `${JIANG} and ${JIANG}`, () => '/mock/a.jpg')
    expect(root.querySelectorAll(`.${MENTION_CHIP_CLASS}`).length).toBe(2)
    const { elementRefImgs } = serializePromptEl(root)
    expect(elementRefImgs).toEqual(['/mock/a.jpg'])
  })
})
