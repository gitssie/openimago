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
  /**
   * Extra request headers for the media fetch (openimago-tc8t). Clip previews are
   * static same-origin /mock files needing no auth, but the BGM bed resolves to
   * the authed `/api/platform/assets/:id/download`, which 401s without a Bearer
   * token. The HOST threads `Authorization: Bearer <token>` here (it owns the
   * auth store); the fork never reaches into the web auth store itself.
   */
  headers?: Record<string, string>
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
  // Transparent so the embedded timeline/player panes do NOT repaint solid void
  // over StoryCutPanel's ambient glow (reference cut_panel_v2). The dark base now
  // lives on the editor HOST background (.story-cut__editor), and the glow shows
  // in the margins around the 9:16 media-player pane. applyImagoTheme writes this
  // inline on the host, so it must be transparent here too (not just in scoped CSS).
  [OMNI_THEME_VARS.background]: 'transparent',
  [OMNI_THEME_VARS.clipFill]: 'var(--imago-bg-surface)',
  [OMNI_THEME_VARS.clipBorder]: 'var(--imago-border-soft)',
  [OMNI_THEME_VARS.accent]: 'var(--imago-neon-cyan)',
  // Approved minimal look (docs/images/cut_panel.png): the playhead is a thin
  // WHITE vertical line, NOT cyan. applyImagoTheme writes these as inline styles
  // on the editor host, so this map — not StoryCutPanel's scoped CSS — is the
  // source of truth for the live editor's playhead colour.
  [OMNI_THEME_VARS.playhead]: 'var(--imago-text-primary)',
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
  /** Precomputed filmstrip sprite for the timeline strip (openimago-78m9):
   *  a horizontal-strip image of N 9:16 frames + its dims. The fork renders the
   *  strip statically via CSS background-position (no WebCodecs). null → the clip
   *  falls back to a flat lane (no per-frame thumbnails). */
  filmstripUrl?: string | null
  filmstripFrameCount?: number | null
  filmstripFrameW?: number | null
  filmstripFrameH?: number | null
  /** Real SOURCE video duration (seconds) — sprite-frame mapping basis for the
   *  per-second-with-inPoint filmstrip (openimago-px5g). */
  filmstripSourceDurationSeconds?: number | null
}

/**
 * The Cut's single BGM bed to lay onto its own audio track during hydration
 * (openimago-w5bu). `url` is the resolved, fetchable artifact URL (host-resolved
 * the same way clip media is); `id` is the bgm artifactId, reused as the audio
 * effect id so edits map back. The fork imports the url (importFromUrl) and
 * places it as an audio effect on a NEW track → the green waveform lane under
 * the video track (docs/images/cut_panel.png).
 */
export interface HydrateBgm {
  id: string
  url: string
  name: string
  /**
   * Auth (and any other) headers for the BGM media fetch (openimago-tc8t). The
   * BGM url is the authed `/api/platform/assets/:id/download`, so the host passes
   * `Authorization: Bearer <token>` here; the fork forwards it to importFromUrl.
   */
  headers?: Record<string, string>
}

export interface OmniclipForkApi {
  importFromUrl: (url: string, options?: ImportFromUrlOptions) => Promise<ImportedMedia>
  /**
   * Replace the timeline with these ordered clips + transitions (hydration).
   * An optional bgm bed is placed on its own audio track (the green waveform
   * lane under the video track).
   */
  hydrateFromCut: (
    clips: HydrateClip[],
    transitions: OmniTransition[],
    bgm?: HydrateBgm,
  ) => Promise<void>
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
