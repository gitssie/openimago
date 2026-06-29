// Provide the GLOBAL `PIXI` the vendored omniclip compositor expects (openimago-48ns).
//
// The vendored 1.1.3 compositor (upstream/context/controllers/compositor/**) reads a
// GLOBAL `PIXI` at ~100 sites, including at MODULE-LOAD time — e.g. filter-manager.ts:3
// does `const filters = {...PIXI, ...PIXI.filters}` as a top-level statement. The
// standalone app sets that global by loading pixi.js + an ecosystem (pixi-filters,
// @pixi/graphics-extras, @pixi-essentials/{object-pool,bounds,transformer}) as UMD
// <script> tags in upstream/index.html.ts. The fork boot bypasses index.html.ts, so
// the global was never set → "PIXI is not defined".
//
// We replicate that global from the installed ESM packages instead of CDN/UMD scripts
// (must work offline). A bare `PIXI` identifier resolves to `globalThis.PIXI` even in
// strict-mode ES modules (global-object properties are visible as bare identifiers),
// exactly as the UMD `window.PIXI` did.
//
// IMPORTANT — ORDERING: this module is imported FIRST by index.ts (before the upstream
// context), so its body runs (sets globalThis.PIXI) before any compositor module
// top-level evaluates. ES modules evaluate imports depth-first in source order, so a
// dedicated first-imported side-effect module is the correct way to seed the global
// ahead of the upstream graph.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).
import * as PIXIcore from 'pixi.js'
import * as pixiFilters from 'pixi-filters'
import { Transformer } from '@pixi-essentials/transformer'
import '@pixi/graphics-extras' // side-effect: mixes extra geometry methods into PIXI.Graphics

// pixi.js's namespace export is read-only (frozen module namespace), so build a mutable
// object that MIRRORS the UMD `window.PIXI` the standalone sets up, then augment it with
// the ecosystem symbols the compositor reads off the global.
const PIXI: Record<string, unknown> = { ...(PIXIcore as Record<string, unknown>) }

// pixi-filters: the UMD attaches extra filters both onto `PIXI.filters` and (for some)
// directly onto `PIXI`. filter-manager.ts:3 spreads BOTH (`{...PIXI, ...PIXI.filters}`),
// so expose them both ways. (Core filters like BlurFilter already live on PIXIcore.)
PIXI.filters = { ...((PIXI.filters as Record<string, unknown>) ?? {}), ...(pixiFilters as Record<string, unknown>) }
Object.assign(PIXI, pixiFilters as Record<string, unknown>)

// @pixi-essentials/transformer exports the class; the compositor reads it as
// `PIXI.Transformer`. (object-pool + bounds are transformer's own deps — resolved via
// its ESM imports, not read off the global, so they only need to be installed.)
PIXI.Transformer = Transformer

;(globalThis as unknown as { PIXI?: unknown }).PIXI = PIXI

// Referenced by index.ts so this side-effect import is never tree-shaken away.
export const pixiGlobalReady = true
