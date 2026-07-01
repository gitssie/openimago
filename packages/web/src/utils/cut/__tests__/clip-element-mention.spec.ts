import { describe, it, expect } from 'vitest'
import {
  elementRefToken,
  mentionLabel,
  extractElementMentions,
  appendMention,
  removeMention,
} from '../clip-element-mention'

describe('elementRefToken', () => {
  it('builds a name-based token', () => {
    expect(elementRefToken('Jiang Cheng')).toBe('Element_Jiang_Cheng_ref_img')
  })

  it('preserves unicode (CJK) names', () => {
    expect(elementRefToken('江 澄')).toBe('Element_江_澄_ref_img')
  })

  it('collapses punctuation runs and trims edge underscores', () => {
    expect(elementRefToken('  Lin-北 (main) ')).toBe('Element_Lin_北_main_ref_img')
  })

  it('returns empty for a blank name', () => {
    expect(elementRefToken('   ')).toBe('')
  })
})

describe('mentionLabel', () => {
  it('renders the token body with spaces', () => {
    expect(mentionLabel('Element_Jiang_Cheng_ref_img')).toBe('Jiang Cheng')
  })
})

describe('extractElementMentions', () => {
  it('finds tokens in order, de-duplicated', () => {
    const prompt = '镜头里 Element_Jiang_Cheng_ref_img 与 Element_江_澄_ref_img，再看 Element_Jiang_Cheng_ref_img'
    expect(extractElementMentions(prompt)).toEqual([
      'Element_Jiang_Cheng_ref_img',
      'Element_江_澄_ref_img',
    ])
  })

  it('returns [] when there are no tokens', () => {
    expect(extractElementMentions('a plain prompt')).toEqual([])
  })
})

describe('appendMention', () => {
  it('appends with a single separating space', () => {
    expect(appendMention('a wide shot', 'Element_Jiang_Cheng_ref_img')).toBe(
      'a wide shot Element_Jiang_Cheng_ref_img',
    )
  })

  it('is idempotent — does not duplicate an existing token', () => {
    const p = 'x Element_Jiang_Cheng_ref_img'
    expect(appendMention(p, 'Element_Jiang_Cheng_ref_img')).toBe(p)
  })

  it('handles an empty prompt', () => {
    expect(appendMention('', 'Element_A_ref_img')).toBe('Element_A_ref_img')
  })
})

describe('removeMention', () => {
  it('removes the token and tidies whitespace', () => {
    const p = 'a shot Element_Jiang_Cheng_ref_img of the city'
    expect(removeMention(p, 'Element_Jiang_Cheng_ref_img')).toBe('a shot of the city')
  })

  it('removes every occurrence', () => {
    const p = 'Element_A_ref_img and Element_A_ref_img'
    expect(removeMention(p, 'Element_A_ref_img')).toBe('and')
  })
})
