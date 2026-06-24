// omniclip fork bootstrap (openimago-uyd0).
//
// Boots omniclip (which registers <construct-editor>/<omni-timeline>/... and the
// global omnislate.context as an import side-effect) and returns an object that
// satisfies the host-facing contract OmniclipForkApi
// (src/utils/cut/fork-contract.ts). The Cut panel (openimago-4eiw) calls
// ONLY this surface; it never reaches into omniclip internals.
//
// BROWSER-ONLY: this whole directory is excluded from repo typecheck/lint and is
// validated by the user locally (see LOCAL_VALIDATION.md). The pure logic it
// composes is unit-tested in src/utils/cut/.

import 'omniclip' // side-effect: register_to_dom + setupContext() (global)
import { omnislate, OmniContext } from 'omniclip/x/context/context.js'
import { TimelinePanel } from 'omniclip/x/components/omni-timeline/panel.js'
import { MediaPlayerPanel } from 'omniclip/x/components/omni-timeline/views/media-player/panel.js'
import { freshId } from '@benev/construct/x/mini.js'
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
// auto` fills the remainder. Player ~62%, timeline fills the rest (~38%).
const PLAYER_PANE_PERCENT = 62

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
        size: PLAYER_PANE_PERCENT,
        active_leaf_index: 0,
        children: [{ id: freshId(), kind: 'leaf', panel: 'MediaPlayerPanel' }],
      },
      {
        id: freshId(),
        kind: 'pane',
        size: null,
        active_leaf_index: 0,
        children: [{ id: freshId(), kind: 'leaf', panel: 'TimelinePanel' }],
      },
    ],
  })
}

// Rebuild the global context with the player+timeline layout. Only the two panels
// we use are registered (no MediaPanel/ExportPanel — openimago-h8v6 scope).
omnislate.context = new OmniContext({
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
// set_canvas_resolution rebuilds the fabric canvas buffer at the new size. The
// media-player CSS aspect-ratio is overridden to 9/16 by media-player-styles.patch.
const PORTRAIT_W = 1080
const PORTRAIT_H = 1920
omnislate.context.actions.set_project_resolution(PORTRAIT_W, PORTRAIT_H)
omnislate.context.controllers.compositor.set_canvas_resolution(PORTRAIT_W, PORTRAIT_H)

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
