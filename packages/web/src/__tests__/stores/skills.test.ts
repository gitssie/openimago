import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Skill } from '../../api/client'

vi.mock('../../api/client', () => ({
  api: {
    listSkills: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
  },
}))

import { api } from '../../api/client'
import { useSkillsStore } from '../../stores/skills'

const mockApi = vi.mocked(api)

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'sk-1',
    name: 'code-review',
    description: 'Review the diff',
    content: '# Code Review',
    status: 'active',
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('Skills Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchAll() loads skills from the api and toggles loading', async () => {
    const skill = makeSkill()
    mockApi.listSkills.mockResolvedValue([skill])

    const store = useSkillsStore()
    expect(store.skills).toEqual([])

    const promise = store.fetchAll()
    expect(store.loading).toBe(true)
    await promise

    expect(store.loading).toBe(false)
    expect(store.skills).toEqual([skill])
  })

  it('fetchAll() clears loading even when the api rejects', async () => {
    mockApi.listSkills.mockRejectedValue(new Error('boom'))

    const store = useSkillsStore()
    await expect(store.fetchAll()).rejects.toThrow('boom')
    expect(store.loading).toBe(false)
  })

  it('create() prepends the new skill to the list', async () => {
    const existing = makeSkill({ name: 'existing' })
    const created = makeSkill({ name: 'new-skill', id: 'sk-2' })
    mockApi.createSkill.mockResolvedValue(created)

    const store = useSkillsStore()
    store.skills.push(existing)

    const result = await store.create({ name: 'new-skill', description: 'd', content: 'c' })

    expect(result).toEqual(created)
    expect(store.skills[0]).toEqual(created)
    expect(store.skills).toHaveLength(2)
  })

  it('update() is keyed by name and refetches the list', async () => {
    const updated = makeSkill({ description: 'updated' })
    mockApi.updateSkill.mockResolvedValue(updated)
    mockApi.listSkills.mockResolvedValue([updated])

    const store = useSkillsStore()
    await store.update('code-review', { description: 'updated' })

    expect(mockApi.updateSkill).toHaveBeenCalledWith('code-review', { description: 'updated' })
    expect(mockApi.listSkills).toHaveBeenCalled()
    expect(store.skills).toEqual([updated])
  })

  it('remove() is keyed by name and drops the skill from the list', async () => {
    mockApi.deleteSkill.mockResolvedValue({ ok: true })

    const store = useSkillsStore()
    store.skills.push(makeSkill({ name: 'a' }), makeSkill({ name: 'b', id: 'sk-2' }))

    await store.remove('a')

    expect(mockApi.deleteSkill).toHaveBeenCalledWith('a')
    expect(store.skills.map((s) => s.name)).toEqual(['b'])
  })
})
