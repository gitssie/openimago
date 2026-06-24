// Clear omniclip's persisted editor state BEFORE omniclip boots (openimago-mb66).
//
// omniclip persists its editor state to localStorage (`omniclip_effects`,
// `omniclip_tracks`) and its panel layout (`construct_layout`), then RESTORES
// them when its OmniContext is constructed — which happens as a side-effect of
// `import 'omniclip'` (main.js → setupContext() → new OmniContext, whose
// constructor reads `#state_from_storage` from these keys). In our ownership
// model A, cut.json is the SINGLE source of truth and we hydrate the timeline
// from it; omniclip's restored state conflicts — it shows GHOST clips (e.g. a
// clip not in the current cut) before/instead of our hydration, so the timeline
// and preview "don't match" the cut.
//
// This module is imported FIRST in index.ts (before `import 'omniclip'`) so the
// removal runs before omniclip's import side-effect reads the keys (ESM module
// side-effects execute in source order; a removeItem placed AFTER the omniclip
// import would run too late — the context is already constructed and restored).
//
// NOTE: this is done at MODULE TOP LEVEL (not behind a function) so it runs at
// import-evaluation time. We ALSO export `cleared` and reference it from index.ts
// so a side-effect-only `import './clear-omni-persistence'` can't be tree-shaken
// away by Rollup (which would silently re-introduce the ghost-clip bug).
//
// construct_layout is also cleared here (we force our two-pane layout via
// reset_to_default at boot anyway — openimago-h8v6), so no stale layout lingers.
//
// BROWSER-ONLY: localStorage. Wrapped in try/catch so a privacy mode that throws
// on localStorage access never breaks boot.

function clearOmniPersistence(): boolean {
  try {
    localStorage.removeItem('omniclip_effects')
    localStorage.removeItem('omniclip_tracks')
    localStorage.removeItem('construct_layout')
    return true
  } catch {
    // localStorage unavailable (private mode / disabled) — nothing to clear.
    return false
  }
}

/** Truthy marker referenced by index.ts so this module is never tree-shaken. */
export const cleared = clearOmniPersistence()
