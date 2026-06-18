// Host-facing omniclip fork contract (production copy, openimago-4eiw).
// Promoted from the spike; the vendored fork (src/vendor/omniclip-fork)
// implements this. The panel depends ONLY on these types and obtains the live
// implementation via a dynamic import at mount, keeping the browser-only vendor
// code out of the repo typecheck path.

import type { CutTransitionKind } from './cut-types'

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

export interface OmniTransition {
  afterEffectId: string
  kind: CutTransitionKind
  durationMs: number
}

export interface OmniclipForkApi {
  importFromUrl: (url: string, options?: ImportFromUrlOptions) => Promise<ImportedMedia>
  registerClipMenuItems: (items: ClipMenuItem[]) => () => void
  setTransition: (transition: OmniTransition) => void
  clearTransition: (afterEffectId: string) => void
  readTransitions: () => OmniTransition[]
  themeVars: Record<string, string>
}

/** Loader the panel calls at mount; real impl dynamically imports the vendor. */
export type LoadOmniclipFork = () => Promise<{
  fork: OmniclipForkApi
  applyImagoTheme: (wrapper: HTMLElement) => HTMLElement
}>
