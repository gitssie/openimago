import { describe, it, expect } from 'vitest'
import { isClipContextTarget } from '../clip-menu-target'

// A right-click composedPath is an ordered list of the ancestors of the clicked
// node. omniclip renders the trim-handle overlay (`.trim-handles` + its
// `.trim-handle-left/right` grips) as a SIBLING of `.effect`, so a right-click on
// a handle yields a path that never contains `.effect` (openimago-p90g). The gate
// must still recognise it as a clip target. `isClipContextTarget` takes just the
// class lists along the path so it stays DOM-free and unit-testable.

describe('isClipContextTarget', () => {
  it('is true when the path contains the clip body (.effect)', () => {
    const path = [['content'], ['effect'], ['timeline-relative']]
    expect(isClipContextTarget(path)).toBe(true)
  })

  it('is true when the path starts on a trim-handle overlay (no .effect in chain)', () => {
    // right-clicking a grip: line → trim-handle-left → trim-handles → host …
    const path = [['line'], ['trim-handle-left'], ['trim-handles'], ['timeline-relative']]
    expect(isClipContextTarget(path)).toBe(true)
  })

  it('is true when the path is on a trim-handle grip element itself', () => {
    const path = [['trim-handle-right'], ['trim-handles']]
    expect(isClipContextTarget(path)).toBe(true)
  })

  it('is false for a right-click outside any clip', () => {
    const path = [['timeline-relative'], ['toolbar'], ['body']]
    expect(isClipContextTarget(path)).toBe(false)
  })

  it('is false for an empty path', () => {
    expect(isClipContextTarget([])).toBe(false)
  })

  it('tolerates elements with multiple classes', () => {
    const path = [['grip', 'trim-handle-left', 'active'], ['overlay', 'trim-handles']]
    expect(isClipContextTarget(path)).toBe(true)
  })
})
