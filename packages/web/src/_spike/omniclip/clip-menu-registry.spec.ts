import { describe, it, expect, vi } from 'vitest'
import { ClipMenuRegistry } from './clip-menu-registry'
import type { ClipMenuItem } from './fork-contract'

function item(id: string, over: Partial<ClipMenuItem> = {}): ClipMenuItem {
  return { id, label: id, onSelect: () => {}, ...over }
}

describe('ClipMenuRegistry', () => {
  it('registers items and lists them for a clip', () => {
    const reg = new ClipMenuRegistry()
    reg.register([item('regenerate'), item('add-to-chat')])
    const visible = reg.visibleItems({ effectId: 'e1', sourceShotId: 'shot_1' })
    expect(visible.map((i) => i.id)).toEqual(['regenerate', 'add-to-chat'])
  })

  it('unregister removes exactly the items it added', () => {
    const reg = new ClipMenuRegistry()
    const dispose = reg.register([item('a'), item('b')])
    reg.register([item('c')])
    dispose()
    expect(reg.visibleItems({ effectId: 'e', sourceShotId: 's' }).map((i) => i.id)).toEqual(['c'])
  })

  it('hides items whose isEnabled returns false (orphan clip)', () => {
    const reg = new ClipMenuRegistry()
    reg.register([
      item('regenerate', { isEnabled: (c) => c.sourceShotId !== undefined }),
      item('delete'),
    ])
    const orphan = reg.visibleItems({ effectId: 'e1', sourceShotId: undefined })
    expect(orphan.map((i) => i.id)).toEqual(['delete'])
  })

  it('notifies subscribers on register and unregister', () => {
    const reg = new ClipMenuRegistry()
    const spy = vi.fn()
    const off = reg.onChange(spy)
    const dispose = reg.register([item('a')])
    expect(spy).toHaveBeenCalledTimes(1)
    dispose()
    expect(spy).toHaveBeenCalledTimes(2)
    off()
    reg.register([item('b')])
    expect(spy).toHaveBeenCalledTimes(2) // no longer listening
  })
})
