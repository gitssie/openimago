// Contract tests for the omniclip fork seam (openimago-c80q).
// Exercises the pieces with real logic; the runtime method signatures are
// type-checked by the mapper/panel that call them.

import { describe, it, expect } from 'vitest'
import {
  OMNI_THEME_VARS,
  IMAGO_TO_OMNI_THEME,
  buildOmniThemeStyle,
  resolvedMediaFromImport,
  ORPHAN_CLIP_ATTRIBUTE,
  type ImportedMedia,
  type ClipMenuItem,
  type OmniTransition,
} from './fork-contract'
import { CUT_TRANSITION_KINDS, type CutTransitionKind } from './episode-cut.types'
import { cutToOmniclipState } from './cut-omniclip.mapper'
import type { EpisodeCut } from './episode-cut.types'

describe('theming contract', () => {
  it('maps every fork theme var to an --imago-* token (no gaps)', () => {
    const forkVars = Object.values(OMNI_THEME_VARS)
    for (const v of forkVars) {
      expect(IMAGO_TO_OMNI_THEME[v]).toMatch(/^var\(--imago-[a-z-]+\)$/)
    }
    // every mapped key is a real fork var — no stray entries
    expect(Object.keys(IMAGO_TO_OMNI_THEME).sort()).toEqual([...forkVars].sort())
  })

  it('buildOmniThemeStyle returns a fresh applyable style object', () => {
    const a = buildOmniThemeStyle()
    const b = buildOmniThemeStyle()
    expect(a).toEqual(IMAGO_TO_OMNI_THEME)
    expect(a).not.toBe(b) // not the shared constant — safe to mutate
    expect(a[OMNI_THEME_VARS.orphan]).toBe('var(--imago-neon-pink)')
  })

  it('reuses omniclip existing [data-no-file] attribute for orphans', () => {
    expect(ORPHAN_CLIP_ATTRIBUTE).toBe('data-no-file')
  })
})

describe('import glue', () => {
  it('feeds an import result straight into the mapper hydrate path', () => {
    const imported: ImportedMedia = {
      fileHash: 'hash-shot_1',
      rawDurationSeconds: 8,
      frames: 200,
      thumbnail: 'data:image/png;base64,thumb',
      name: 'shot_1.mp4',
    }
    const resolved = resolvedMediaFromImport('shot_1', 'https://cdn/shot_1.mp4', imported)
    expect(resolved).toEqual({
      sourceShotId: 'shot_1',
      url: 'https://cdn/shot_1.mp4',
      fileHash: 'hash-shot_1',
      rawDurationSeconds: 8,
      frames: 200,
      thumbnail: 'data:image/png;base64,thumb',
      name: 'shot_1.mp4',
    })

    // and the mapper can hydrate a clip from it end-to-end
    const cut: EpisodeCut = {
      schemaVersion: 1,
      episodeId: 'ep_001',
      clips: [{ id: 'c1', sourceShotId: 'shot_1', inPoint: 0, outPoint: 5, order: 0 }],
      transitions: [],
      updatedAt: '2026-06-18T00:00:00.000Z',
    }
    const { state, orphans } = cutToOmniclipState(cut, (id) =>
      id === 'shot_1' ? resolved : undefined,
    )
    expect(orphans).toEqual([])
    expect(state.effects[0]).toMatchObject({ file_hash: 'hash-shot_1', frames: 200 })
  })
})

describe('transition primitive contract', () => {
  it('OmniTransition.kind is exactly the shipped CUT_TRANSITION_KINDS', () => {
    // a transition built per the contract type-checks against CutTransitionKind
    const kinds: CutTransitionKind[] = [...CUT_TRANSITION_KINDS]
    const transitions: OmniTransition[] = kinds.map((kind, i) => ({
      afterEffectId: `c${i}`,
      kind,
      durationMs: 500,
    }))
    expect(transitions.map((t) => t.kind)).toEqual(['cut', 'dissolve', 'fade'])
  })
})

describe('clip-menu item contract', () => {
  it('an item hides itself on orphan clips via isEnabled', () => {
    const regenerate: ClipMenuItem = {
      id: 'regenerate',
      label: '重新生成',
      isEnabled: (ctx) => ctx.sourceShotId !== undefined,
      onSelect: () => {},
    }
    expect(regenerate.isEnabled?.({ effectId: 'e1', sourceShotId: 'shot_1' })).toBe(true)
    expect(regenerate.isEnabled?.({ effectId: 'e1', sourceShotId: undefined })).toBe(false)
  })
})
