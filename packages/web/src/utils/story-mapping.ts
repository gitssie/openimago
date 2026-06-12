/**
 * Story element derivation helpers — extracted from ProjectWorkspacePage
 * for testability (ADR 0004, openimago-1a3).
 */
import type {
  OpenimagoStoryBible,
  OpenimagoStoryEpisode,
} from '../api/client'
import type { StoryElement } from '../components/session-workspace/types'

function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function storiesFromBible(bible: OpenimagoStoryBible): StoryElement[] {
  const items: StoryElement[] = []

  // Characters
  for (let idx = 0; idx < bible.characters.length; idx++) {
    const ch = bible.characters[idx]!
    const id = safeStr(ch.id) || safeStr(ch.slug) || `ci-${idx}`
    const title = safeStr(ch.name) || '未命名角色'
    const preview = safeStr(ch.description)
    const thumb = safeStr(ch.thumbnailUrl) || null
    items.push({ id: `char-${id}`, title, preview, thumbnailUrl: thumb, kind: 'character', syncState: 'synced' })
  }

  // Scenes
  for (let idx = 0; idx < bible.scenes.length; idx++) {
    const sc = bible.scenes[idx]!
    const id = safeStr(sc.id) || safeStr(sc.slug) || `si-${idx}`
    const title = safeStr(sc.name) || '未命名场景'
    const preview = safeStr(sc.description)
    const thumb = safeStr(sc.thumbnailUrl) || null
    items.push({ id: `scene-${id}`, title, preview, thumbnailUrl: thumb, kind: 'scene', syncState: 'synced' })
  }

  // Style seeds → references
  for (let idx = 0; idx < bible.styleSeeds.length; idx++) {
    const seed = bible.styleSeeds[idx]!
    const id = safeStr(seed.id) || safeStr(seed.slug) || `ss-${idx}`
    const title = safeStr(seed.name) || '风格参考'
    const preview = safeStr(seed.description)
    const thumb = safeStr(seed.thumbnailUrl) || null
    items.push({ id: `ref-${id}`, title, preview, thumbnailUrl: thumb, kind: 'reference', syncState: 'synced' })
  }

  return items
}

export function storiesFromEpisodes(episodes: OpenimagoStoryEpisode[]): StoryElement[] {
  const items: StoryElement[] = []
  for (const ep of episodes) {
    const shots = ep.shots ?? []
    for (let sIdx = 0; sIdx < shots.length; sIdx++) {
      const shot = shots[sIdx]!
      const id = safeStr(shot.id) || safeStr(shot.slug) || `sh-${sIdx}`
      const desc = safeStr(shot.description) || safeStr(shot.visualPrompt)
      const title = safeStr(shot.title) || desc.slice(0, 40) || '镜头'
      const thumb = safeStr(shot.thumbnailUrl) || safeStr(shot.posterUrl) || null
      const status = safeStr(shot.status)
      const timeLabel = safeStr(shot.timeLabel)
      items.push({
        id: `shot-${id}`,
        title,
        preview: desc,
        thumbnailUrl: thumb,
        kind: 'scene',
        ...(timeLabel ? { timeLabel } : {}),
        syncState: status === 'generated' ? 'synced' : 'pending',
      })
    }
  }
  return items
}
