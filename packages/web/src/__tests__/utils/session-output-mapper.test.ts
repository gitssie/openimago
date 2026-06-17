import { describe, it, expect } from 'vitest'
import {
  workspaceFileToAIOutputItem,
  mergeAIOutputItems,
} from 'src/utils/session-output-mapper'
import type { WorkspaceFile } from 'src/api/client'
import type { AIOutputItem } from 'src/components/session-workspace/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeFile(overrides: Partial<WorkspaceFile> = {}): WorkspaceFile {
  return {
    workspaceFileId: 'wsf_1',
    kind: 'image',
    createdAt: '2026-06-08T10:00:00Z',
    access: {
      preview: { href: 'https://cdn.example.com/preview.png' },
      thumbnail: { href: 'https://cdn.example.com/thumb.webp' },
    },
    filename: 'shot.png',
    prompt: 'a wide shot',
    model: 'flux-pro',
    ...overrides,
  } as WorkspaceFile
}

/** Build a file with `prompt`/`model` absent (not set to undefined). */
function makeBareFile(): WorkspaceFile {
  return {
    workspaceFileId: 'wsf_1',
    kind: 'image',
    createdAt: '2026-06-08T10:00:00Z',
    access: { preview: { href: 'https://cdn.example.com/preview.png' } },
    filename: '',
  } as WorkspaceFile
}

const stableTime = () => '刚刚'

describe('workspaceFileToAIOutputItem', () => {
  it('maps id, kind, filename, prompt and model', () => {
    const item = workspaceFileToAIOutputItem(makeFile(), stableTime)
    expect(item.id).toBe('wsf_1')
    expect(item.kind).toBe('image')
    expect(item.filename).toBe('shot.png')
    expect(item.prompt).toBe('a wide shot')
    expect(item.model).toBe('flux-pro')
  })

  it('prefers thumbnail href for url, falling back to preview', () => {
    const withThumb = workspaceFileToAIOutputItem(makeFile(), stableTime)
    expect(withThumb.url).toBe('https://cdn.example.com/thumb.webp')

    const noThumb = workspaceFileToAIOutputItem(
      makeFile({ access: { preview: { href: 'https://cdn.example.com/preview.png' } } }),
      stableTime,
    )
    expect(noThumb.url).toBe('https://cdn.example.com/preview.png')
  })

  it('uses the injected time formatter on createdAt', () => {
    const item = workspaceFileToAIOutputItem(makeFile(), (d) => d.toISOString())
    expect(item.timeLabel).toBe('2026-06-08T10:00:00.000Z')
  })

  it('falls back to kind for missing filename and empty prompt', () => {
    const item = workspaceFileToAIOutputItem(makeBareFile(), stableTime)
    expect(item.filename).toBe('image')
    expect(item.prompt).toBe('')
    expect(item.model).toBeNull()
  })
})

describe('mergeAIOutputItems', () => {
  const api: AIOutputItem = { id: 'wsf_1', url: 'u1', kind: 'image', timeLabel: '刚刚' }
  const part: AIOutputItem = { id: 'file-0', url: 'u2', kind: 'image', timeLabel: '刚刚' }

  it('concatenates distinct items with API items first', () => {
    const merged = mergeAIOutputItems([api], [part])
    expect(merged.map((i) => i.id)).toEqual(['wsf_1', 'file-0'])
  })

  it('drops a part item that duplicates an API item by id', () => {
    const dupById: AIOutputItem = { id: 'wsf_1', url: 'different', kind: 'image', timeLabel: '刚刚' }
    const merged = mergeAIOutputItems([api], [dupById])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.url).toBe('u1')
  })

  it('drops a part item that duplicates an API item by url', () => {
    const dupByUrl: AIOutputItem = { id: 'file-9', url: 'u1', kind: 'image', timeLabel: '刚刚' }
    const merged = mergeAIOutputItems([api], [dupByUrl])
    expect(merged.map((i) => i.id)).toEqual(['wsf_1'])
  })

  it('keeps multiple url-less items without collapsing them', () => {
    const a: AIOutputItem = { id: 'a', kind: 'image', timeLabel: '刚刚' }
    const b: AIOutputItem = { id: 'b', kind: 'image', timeLabel: '刚刚' }
    const merged = mergeAIOutputItems([], [a, b])
    expect(merged).toHaveLength(2)
  })
})
