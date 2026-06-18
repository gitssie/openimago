// Host-facing CONTRACT for the omniclip fork (ADR 0007, openimago-c80q).
//
// This file is the seam between the heavy omniclip fork (openimago-uyd0, which
// IMPLEMENTS these in a browser env) and the openimago host — the Cut panel and
// the EpisodeCut<->omniclip mapper (openimago-4eiw, which CALLS them). The fork
// must export an object satisfying `OmniclipForkApi`; nothing in the host
// reaches into omniclip internals except through this contract.
//
// Only the pieces with real logic are implemented + unit-tested here
// (theming token names, the orphan-placeholder attribute, helpers). The runtime
// methods are typed signatures the fork fills in.

import type { CutTransitionKind } from './episode-cut.types'
import type { ResolvedShotMedia } from './episode-cut.types'

// ─── 1. Load-from-URL import (spike point 2) ───────────────────────────────────

/** What the fork returns after fetch -> Blob -> File -> content-hash import. */
export interface ImportedMedia {
  /** content hash omniclip assigns; the link from effect.file_hash -> media. */
  fileHash: string
  rawDurationSeconds: number
  frames: number
  thumbnail: string
  name: string
}

export interface ImportFromUrlOptions {
  /** override the derived file name (defaults to the URL basename). */
  name?: string
  /** AbortSignal so the host can cancel a slow fetch. */
  signal?: AbortSignal
}

/**
 * Fetch a remote URL (our Shot Run media), wrap it as a File, run it through
 * omniclip's existing content-hash/IndexedDB import + ffprobe analysis, WITHOUT
 * an <input type=file>. Returns the import-derived facts the mapper needs to
 * build a VideoEffect. The fork (uyd0) implements this over its Media controller.
 */
export type ImportFromUrl = (
  url: string,
  options?: ImportFromUrlOptions,
) => Promise<ImportedMedia>

// ─── 2. Clip context-menu extension hook (spike point 4) ───────────────────────

/** Context handed to a clip-menu item when the user opens it on a clip. */
export interface ClipMenuContext {
  /** the omniclip effect id of the right-clicked clip. */
  effectId: string
  /** the source Shot id, resolved by the host from effect.file_hash. */
  sourceShotId: string | undefined
}

export interface ClipMenuItem {
  /** stable id, e.g. 'regenerate' | 'add-to-chat' | 'manual-edit' | 'delete'. */
  id: string
  /** display label (host supplies the localized 添加到对话 / 重新生成 / …). */
  label: string
  /** optional icon name the fork renders. */
  icon?: string
  /** hidden when this returns false for the given clip (e.g. orphan clips). */
  isEnabled?: (ctx: ClipMenuContext) => boolean
  /** invoked on click; the host bridges back to the generation layer. */
  onSelect: (ctx: ClipMenuContext) => void
}

/**
 * Register host items onto every clip's context menu. Returns an unregister fn.
 * The fork (uyd0) renders these into the clip menu it adds to the shadow DOM.
 */
export type RegisterClipMenuItems = (items: ClipMenuItem[]) => () => void

// ─── 3. Theming hooks (spike point 5) ──────────────────────────────────────────
//
// The fork exposes these CSS custom properties on its shadow hosts; because
// custom properties inherit THROUGH the shadow boundary, the host sets them on
// an ancestor (mapping --imago-* -> --omni-*) and the values reach inside.

export const OMNI_THEME_VARS = {
  /** timeline/editor background. */
  background: '--omni-bg',
  /** clip (effect) fill. */
  clipFill: '--omni-clip-fill',
  /** clip border. */
  clipBorder: '--omni-clip-border',
  /** selected-clip accent (trim handles, outline). */
  accent: '--omni-accent',
  /** playhead color. */
  playhead: '--omni-playhead',
  /** text color. */
  text: '--omni-text',
  /** orphan / missing-source placeholder color (reuses [data-no-file]). */
  orphan: '--omni-orphan',
} as const

export type OmniThemeVar = (typeof OMNI_THEME_VARS)[keyof typeof OMNI_THEME_VARS]

/**
 * The host's dark-neon `--imago-*` token chosen for each fork theme var. The
 * panel (4eiw) writes `style="--omni-bg: var(--imago-bg-void); …"` from this
 * map onto the editor's wrapper. Centralised here so token drift is caught in
 * one place.
 */
export const IMAGO_TO_OMNI_THEME: Record<OmniThemeVar, string> = {
  [OMNI_THEME_VARS.background]: 'var(--imago-bg-void)',
  [OMNI_THEME_VARS.clipFill]: 'var(--imago-bg-surface)',
  [OMNI_THEME_VARS.clipBorder]: 'var(--imago-border-soft)',
  [OMNI_THEME_VARS.accent]: 'var(--imago-neon-cyan)',
  [OMNI_THEME_VARS.playhead]: 'var(--imago-neon-cyan)',
  [OMNI_THEME_VARS.text]: 'var(--imago-text-primary)',
  [OMNI_THEME_VARS.orphan]: 'var(--imago-neon-pink)',
}

/** Attribute the fork keeps on orphan clips (reuses omniclip's existing one). */
export const ORPHAN_CLIP_ATTRIBUTE = 'data-no-file'

/**
 * Build the inline-style object the panel applies to the editor wrapper to push
 * the dark-neon tokens into omniclip's shadow DOM. Pure — unit-tested.
 */
export function buildOmniThemeStyle(): Record<OmniThemeVar, string> {
  return { ...IMAGO_TO_OMNI_THEME }
}

// ─── 4. Transition primitive (spike point 3 gap) ───────────────────────────────
//
// omniclip 1.0.7 has no transition primitive; the fork adds a minimal one
// between adjacent clips so EpisodeCut.transitions round-trip. The fork's
// transition is keyed by the effect id it plays AFTER, mirroring
// CutTransition.afterClipId, and constrained to the shipped kinds.

export interface OmniTransition {
  /** effect id this transition plays after (== CutTransition.afterClipId). */
  afterEffectId: string
  kind: CutTransitionKind
  durationMs: number
}

export type SetTransition = (transition: OmniTransition) => void
export type ClearTransition = (afterEffectId: string) => void
export type ReadTransitions = () => OmniTransition[]

// ─── The full fork API the host depends on ─────────────────────────────────────

export interface OmniclipForkApi {
  importFromUrl: ImportFromUrl
  registerClipMenuItems: RegisterClipMenuItems
  setTransition: SetTransition
  clearTransition: ClearTransition
  readTransitions: ReadTransitions
  /** the theme vars the fork honours (for the host to set). */
  themeVars: typeof OMNI_THEME_VARS
}

/**
 * Resolve a ResolvedShotMedia (what the mapper's hydrate path consumes) from an
 * import result + the originating Shot/URL. Pure glue — unit-tested — so the
 * fork's `importFromUrl` and the mapper agree on the shape without coupling.
 */
export function resolvedMediaFromImport(
  sourceShotId: string,
  url: string,
  imported: ImportedMedia,
): ResolvedShotMedia {
  return {
    sourceShotId,
    url,
    fileHash: imported.fileHash,
    rawDurationSeconds: imported.rawDurationSeconds,
    frames: imported.frames,
    thumbnail: imported.thumbnail,
    name: imported.name,
  }
}
