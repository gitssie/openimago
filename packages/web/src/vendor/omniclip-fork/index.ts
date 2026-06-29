// omniclip fork bootstrap (openimago-uyd0).
//
// Boots omniclip from the VENDORED 1.1.3 source under ./upstream (openimago-uatf):
// registers <construct-editor>/<omni-timeline>/... and constructs the global
// omnislate.context explicitly (1.1.3's main.ts is a standalone SPA we deliberately
// do NOT run). Returns an object that satisfies the host-facing contract
// OmniclipForkApi (src/utils/cut/fork-contract.ts). The Cut panel (openimago-4eiw)
// calls ONLY this surface; it never reaches into omniclip internals.
//
// BROWSER-ONLY: this whole directory is excluded from repo typecheck/lint and is
// validated by the user locally (see LOCAL_VALIDATION.md). The pure logic it
// composes is unit-tested in src/utils/cut/.

// MUST be first: clears omniclip's persisted state (omniclip_effects/tracks +
// construct_layout) BEFORE we construct the context below — otherwise ghost clips
// from a prior session show before our cut hydration (openimago-mb66). Import order
// = execution order for side-effects; `cleared` is referenced below so Rollup can't
// tree-shake this import away. (The fresh projectId on construction below is the
// primary ghost-clip guard for 1.1.3's per-project store; see openimago-lpjd.)
import { cleared as omniPersistenceCleared } from './clear-omni-persistence'
// Boot from the VENDORED 1.1.3 source (openimago-uatf) instead of npm `omniclip`.
// 1.1.3's main.ts is a standalone SPA (HashRouter that takes over document.body +
// posthog.init), so we do NOT import it; we register the editor custom elements
// ourselves and construct omnislate.context directly — exactly the subset the
// standalone app's /editor route sets up, minus the landing-page/manager shell.
import { register_to_dom, generate_id } from '@benev/slate'
import { ConstructEditor, freshId } from '@benev/construct/x/mini.js'
import { omnislate, OmniContext } from './upstream/context/context'
import { TimelinePanel } from './upstream/components/omni-timeline/panel'
import { MediaPlayerPanel } from './upstream/components/omni-timeline/views/media-player/panel'
// Editor custom elements the standalone /editor route registers (main.ts). The
// panels above render these tags, so they must be defined before the editor mounts.
import { OmniTimeline } from './upstream/components/omni-timeline/component'
import { OmniText } from './upstream/components/omni-text/component'
import { OmniMedia } from './upstream/components/omni-media/component'
import { OmniFilters } from './upstream/components/omni-filters/component'
import { OmniTransitions } from './upstream/components/omni-transitions/component'
import { OmniAnim } from './upstream/components/omni-anim/component'
import type {
  OmniclipForkApi,
  OmniThemeVar,
} from 'src/utils/cut/fork-contract'
import { OMNI_THEME_VARS, IMAGO_TO_OMNI_THEME } from 'src/utils/cut/fork-contract'
import { importFromUrl } from './capabilities/import-from-url'
import { hydrateFromCut } from './capabilities/hydrate-from-cut'
import {
  registerClipMenuItems,
  installClipContextMenu,
  setClipContextResolver,
} from './capabilities/clip-menu'
import { setTransition, clearTransition, readTransitions } from './capabilities/transitions'
import { onEdit } from './capabilities/on-edit'
import { onSelectionChange } from './capabilities/selection'

// ── Two-panel editor layout: video preview player ON TOP of the timeline ──────
// (openimago-h8v6) omniclip's main.js setupContext() hardcodes the layout to
// single_panel_layout("TimelinePanel"), so only the timeline shows — the
// MediaPlayerPanel (the 9:16 preview + playback controls) is registered but never
// placed. We rebuild omnislate.context with the SAME panels but a vertical
// two-pane layout (player above, timeline below), exactly mirroring main.js but
// with custom `layouts`. The media/compositor controllers are recreated as part
// of the new OmniContext; hydrate's composePlacedClips still composes clips into
// the compositor for the player preview.
//
// Layout tree shape matches @benev/construct's single_panel_layout (cell
// vertical:true → pane → leaf) but with TWO panes. `size` is a flex-basis percent
// (sizing_styles: `flex:0 0 <size>%`); a null size on the last pane → `flex:1 1
// auto` fills the remainder.
//
// PANE SIZING (openimago-hamw, supersedes the ypxq 74% player share): the TIMELINE
// pane is bounded to a FIXED height (TIMELINE_PANE_PX, in
// construct-editor-styles.patch.ts) via CSS, because construct's `size` lever only
// emits a flex-basis PERCENT and a percent of the (tall) editor host left the
// timeline unbounded — tracks floated in empty space and omni-timeline's
// overflow:scroll scrolled the ruler/clips away. So BOTH panes here use `size:null`
// (→ inline `flex:1 1 auto`); the CSS patch then forces ONLY the timeline pane to
// `flex:0 0 TIMELINE_PANE_PX` (with !important to beat the inline flex), and the
// PLAYER pane keeps `flex:1 1 auto` and FLEXES to fill the remaining height above
// it — the 9:16 preview (width = leaf height × 9/16) stays flexible, as large as
// the space allows, NOT boxed. Tuned with the figure-margin trim in
// media-player-styles.patch.ts.

function twoPanelLayout() {
  return () => ({
    id: freshId(),
    kind: 'cell',
    size: null,
    vertical: true,
    children: [
      {
        id: freshId(),
        kind: 'pane',
        // Player flexes to fill the height ABOVE the fixed timeline pane.
        size: null,
        active_leaf_index: 0,
        children: [{ id: freshId(), kind: 'leaf', panel: 'MediaPlayerPanel' }],
      },
      {
        id: freshId(),
        kind: 'pane',
        // Nominally flex; the construct-editor-styles patch pins this pane (the one
        // hosting <omni-timeline>) to TIMELINE_PANE_PX so the leaf is exactly that tall.
        size: null,
        active_leaf_index: 0,
        children: [{ id: freshId(), kind: 'leaf', panel: 'TimelinePanel' }],
      },
    ],
  })
}

// Reference the persistence-clear marker (openimago-mb66) so its module is
// retained and runs before omniclip restored state above; no-op at runtime.
void omniPersistenceCleared

// Register the editor custom elements (the standalone app does this in its /editor
// route). <construct-editor> hosts the layout/panels; the Omni* components are the
// tags the panels render.
//
// @benev/slate 0.1.x's register_to_dom(elements) takes NO `soft` option and calls
// customElements.define unconditionally — it throws NotSupportedError if a tag is
// already defined (openimago-j82k; 0.3.x's register(elements,{soft}) is gone now
// that the fork is pinned to slate 0.1.2 to dedupe with @benev/construct). Register
// each element individually and swallow the "already defined" error so dev HMR
// re-evaluation (or a tag defined elsewhere) is a no-op instead of a hard throw.
function registerEditorElements(elements: Record<string, { new (): HTMLElement }>): void {
  for (const [name, element] of Object.entries(elements)) {
    try {
      register_to_dom({ [name]: element })
    } catch (err) {
      if (!(err instanceof DOMException) || err.name !== 'NotSupportedError') throw err
    }
  }
}
registerEditorElements({
  ConstructEditor,
  OmniTimeline,
  OmniText,
  OmniMedia,
  OmniFilters,
  OmniTransitions,
  OmniAnim,
})

// Build the global context with the player+timeline layout. Only the two panels
// we use are placed (no MediaPanel/ExportPanel — openimago-h8v6 scope). 1.1.3's
// OmniContext requires a projectId (keys per-project localStorage persistence); a
// fresh id each boot yields an empty project (no stale/ghost clips), matching the
// clear-on-boot intent above — hydrateFromCut then populates it.
omnislate.context = new OmniContext({
  projectId: generate_id(),
  panels: { TimelinePanel, MediaPlayerPanel },
  layouts: { empty: twoPanelLayout(), default: twoPanelLayout() },
})
// LayoutController persists the active layout to localStorage and reloads it on
// construct; a previously-stored SINGLE-panel layout would otherwise mask ours.
// reset_to_default() forces our two-pane default, discarding any stale stored tree.
omnislate.context.layout.reset_to_default()

// ── Portrait 9:16 project resolution (openimago-vm5v) ─────────────────────────
// omniclip defaults to 1920×1080 (16:9, state.js non_historical_state.settings),
// so our 9:16 clips render letterboxed in a landscape canvas, exposing the dark
// .lower-canvas. Set the project to portrait 1080×1920 the same way omniclip's
// project-settings view does: the action updates state.settings, and
// set_canvas_resolution rebuilds the pixi.js canvas/renderer at the new size (1.1.3
// migrated the compositor from fabric.js to pixi.js). The media-player CSS
// aspect-ratio is overridden to 9/16 by media-player-styles.patch.
const PORTRAIT_W = 1080
const PORTRAIT_H = 1920
omnislate.context.actions.set_project_resolution(PORTRAIT_W, PORTRAIT_H)
omnislate.context.controllers.compositor.set_canvas_resolution(PORTRAIT_W, PORTRAIT_H)

// TEMPORARY DIAGNOSTIC (openimago-qsb5): re-expose the slate on window.__omni so
// the fabric video objects can be inspected live (geometry/overflow hypothesis for
// the blank preview). DEV-gated; remove once the root cause is confirmed and fixed.
if (import.meta.env.DEV) {
  ;(window as unknown as { __omni?: unknown }).__omni = omnislate
}

// Install the document-level clip context-menu listener once at boot
// (openimago-1mcb) — the Effect view is sealed, so the menu is driven from a
// composedPath() contextmenu handler rather than a patched lit render.
installClipContextMenu()

/** The fork API the host depends on. */
export const omniclipFork: OmniclipForkApi = {
  importFromUrl,
  hydrateFromCut,
  registerClipMenuItems,
  setClipContextResolver,
  setTransition,
  clearTransition,
  readTransitions,
  onEdit,
  onSelectionChange,
  themeVars: OMNI_THEME_VARS,
}

/**
 * Apply the dark-neon `--imago-*` tokens onto an ancestor element of the editor
 * so they inherit into omniclip's shadow DOM. Call once after mounting the
 * editor element. Returns the wrapper for chaining.
 */
export function applyImagoTheme(wrapper: HTMLElement): HTMLElement {
  for (const [omniVar, imagoValue] of Object.entries(IMAGO_TO_OMNI_THEME) as Array<
    [OmniThemeVar, string]
  >) {
    wrapper.style.setProperty(omniVar, imagoValue)
  }
  return wrapper
}

export type { OmniclipForkApi }
