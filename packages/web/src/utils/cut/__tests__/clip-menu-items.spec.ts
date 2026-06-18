import { describe, it, expect, vi } from 'vitest'
import { buildClipMenuItems, type ClipMenuCallbacks } from '../clip-menu-items'
import type { ClipMenuContext } from '../fork-contract'

function callbacks(): ClipMenuCallbacks {
  return {
    onRegenerate: vi.fn(),
    onManualEdit: vi.fn(),
    onDeleteClip: vi.fn(),
    onAddToChat: vi.fn(),
  }
}

const live: ClipMenuContext = { effectId: 'e1', sourceShotId: 'shot_1' }
const orphan: ClipMenuContext = { effectId: 'e1', sourceShotId: undefined }

describe('buildClipMenuItems', () => {
  it('exposes the 4 items with the expected labels', () => {
    const items = buildClipMenuItems(callbacks())
    expect(items.map((i) => i.label)).toEqual(['添加到对话', '重新生成', '手动编辑', '删除'])
  })

  it('routes each item to its callback with the right argument', () => {
    const cb = callbacks()
    const items = buildClipMenuItems(cb)
    const byId = (id: string) => items.find((i) => i.id === id)!

    byId('add-to-chat').onSelect(live)
    byId('regenerate').onSelect(live)
    byId('manual-edit').onSelect(live)
    byId('delete-clip').onSelect(live)

    expect(cb.onAddToChat).toHaveBeenCalledWith('shot_1')
    expect(cb.onRegenerate).toHaveBeenCalledWith('shot_1')
    expect(cb.onManualEdit).toHaveBeenCalledWith('shot_1')
    expect(cb.onDeleteClip).toHaveBeenCalledWith('e1') // clip, not shot
  })

  it('hides shot-bound items on orphan clips but keeps 删除', () => {
    const items = buildClipMenuItems(callbacks())
    const enabled = (id: string) => {
      const item = items.find((i) => i.id === id)!
      return item.isEnabled ? item.isEnabled(orphan) : true
    }
    expect(enabled('add-to-chat')).toBe(false)
    expect(enabled('regenerate')).toBe(false)
    expect(enabled('manual-edit')).toBe(false)
    expect(enabled('delete-clip')).toBe(true)
  })

  it('shot-bound onSelect is a no-op on an orphan (defensive)', () => {
    const cb = callbacks()
    const items = buildClipMenuItems(cb)
    items.find((i) => i.id === 'regenerate')!.onSelect(orphan)
    expect(cb.onRegenerate).not.toHaveBeenCalled()
    // delete still fires for orphans
    items.find((i) => i.id === 'delete-clip')!.onSelect(orphan)
    expect(cb.onDeleteClip).toHaveBeenCalledWith('e1')
  })
})
