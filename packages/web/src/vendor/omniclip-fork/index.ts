// omniclip fork bootstrap (openimago-uyd0).
//
// Boots omniclip (which registers <construct-editor>/<omni-timeline>/... and the
// global omnislate.context as an import side-effect) and returns an object that
// satisfies the host-facing contract OmniclipForkApi
// (src/_spike/omniclip/fork-contract.ts). The Cut panel (openimago-4eiw) calls
// ONLY this surface; it never reaches into omniclip internals.
//
// BROWSER-ONLY: this whole directory is excluded from repo typecheck/lint and is
// validated by the user locally (see LOCAL_VALIDATION.md). The pure logic it
// composes is unit-tested in src/_spike/omniclip/.

import 'omniclip' // side-effect: register_to_dom + setupContext() (global)
import type {
  OmniclipForkApi,
  OmniThemeVar,
} from 'src/_spike/omniclip/fork-contract'
import { OMNI_THEME_VARS, IMAGO_TO_OMNI_THEME } from 'src/_spike/omniclip/fork-contract'
import { importFromUrl } from './capabilities/import-from-url'
import { registerClipMenuItems } from './capabilities/clip-menu'
import { setTransition, clearTransition, readTransitions } from './capabilities/transitions'

/** The fork API the host depends on. */
export const omniclipFork: OmniclipForkApi = {
  importFromUrl,
  registerClipMenuItems,
  setTransition,
  clearTransition,
  readTransitions,
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
