// Host-facing omniclip fork contract (production copy, openimago-4eiw).
// Promoted from the spike; the vendored fork (src/vendor/omniclip-fork)
// implements this. The panel depends ONLY on these types and obtains the live
// implementation via a dynamic import at mount, keeping the browser-only vendor
// code out of the repo typecheck path.

import type { CutTransitionKind, ResolvedShotMedia } from './cut-types'
import type { CutEdit } from './cut-edit-dispatcher'

export interface ImportedMedia {
  fileHash: string
  rawDurationSeconds: number
  frames: number
  thumbnail: string
  name: string
}

export interface ImportFromUrlOptions {
  name?: string
  signal?: AbortSignal
}

/**
 * Fetch a remote URL (our Shot Run media), wrap it as a File, run it through
 * omniclip's content-hash/IndexedDB import WITHOUT an <input type=file>, and
 * return the import-derived facts. The vendored fork implements this.
 */
export type ImportFromUrl = (
  url: string,
  options?: ImportFromUrlOptions,
) => Promise<ImportedMedia>

export interface ClipMenuContext {
  effectId: string
  sourceShotId: string | undefined
}

export interface ClipMenuItem {
  id: string
  label: string
  icon?: string
  isEnabled?: (ctx: ClipMenuContext) => boolean
  onSelect: (ctx: ClipMenuContext) => void
}

/** Register host items onto every clip's context menu; returns an unregister fn. */
export type RegisterClipMenuItems = (items: ClipMenuItem[]) => () => void

export interface OmniTransition {
  afterEffectId: string
  kind: CutTransitionKind
  durationMs: number
}

export type SetTransition = (transition: OmniTransition) => void
export type ClearTransition = (afterEffectId: string) => void
export type ReadTransitions = () => OmniTransition[]

// ─── Theming hooks ─────────────────────────────────────────────────────────────
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
 * The host's dark-neon `--imago-*` token chosen for each fork theme var.
 * Centralised here so token drift is caught in one place.
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

/**
 * One clip to lay onto the timeline during hydration: its source media url + a
 * stable id (the CutClip id) + trim points in seconds. Orphan clips (no
 * resolvable media) are NOT passed here — the host renders them via the
 * data-no-file path instead.
 */
export interface HydrateClip {
  id: string
  url: string
  name: string
  inPointSeconds: number
  outPointSeconds: number
}

export interface OmniclipForkApi {
  importFromUrl: (url: string, options?: ImportFromUrlOptions) => Promise<ImportedMedia>
  /** Replace the timeline with these ordered clips + transitions (hydration). */
  hydrateFromCut: (clips: HydrateClip[], transitions: OmniTransition[]) => Promise<void>
  registerClipMenuItems: (items: ClipMenuItem[]) => () => void
  /** Map a clicked effect id → its sourceShotId for the menu (orphan-gating). */
  setClipContextResolver: (fn: (effectId: string) => string | undefined) => void
  setTransition: (transition: OmniTransition) => void
  clearTransition: (afterEffectId: string) => void
  readTransitions: () => OmniTransition[]
  /**
   * Subscribe to committed editor gestures (ADR 0008 #1/#1a). The fork diffs
   * omniclip's `effects` snapshot on each settled gesture and emits ONE semantic
   * CutEdit (reorder / trim / split / delete) — never per intermediate frame.
   * Returns an unsubscribe fn. Transition/BGM edits are host-driven (decision
   * 1b) and do NOT arrive through this channel.
   */
  onEdit: (cb: (edit: CutEdit) => void) => () => void
  themeVars: Record<string, string>
}

/** Loader the panel calls at mount; real impl dynamically imports the vendor. */
export type LoadOmniclipFork = () => Promise<{
  fork: OmniclipForkApi
  applyImagoTheme: (wrapper: HTMLElement) => HTMLElement
}>

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
