# Vendored omniclip fork (openimago-uyd0)

Fork of **omniclip@1.0.7** hardened for openimago per ADR 0007. Implements the
host-facing contract in `src/utils/cut/fork-contract.ts`:

| Capability | Contract symbol | File here |
|---|---|---|
| Load-from-URL import | `importFromUrl` | `capabilities/import-from-url.ts` |
| Clip context-menu hook | `registerClipMenuItems` | `capabilities/clip-menu.ts` + `patches/effect.patch.ts` |
| Theming (`--imago-*` → shadow DOM) | `OMNI_THEME_VARS` / `::part` | `patches/theme.css.ts` |
| Transition primitive (`cut\|dissolve\|fade`) | `setTransition`/`clearTransition`/`readTransitions` | `capabilities/transitions.ts` + `patches/state.patch.ts` |

`index.ts` boots omniclip and returns an object satisfying `OmniclipForkApi`.

## IMPORTANT — this directory is browser-only and NOT type-checked in this repo

omniclip needs **WebCodecs + SharedArrayBuffer + IndexedDB** and a full
`@benev/slate` + `@benev/construct` + ffmpeg-wasm build. The headless coder
sandbox cannot build or run it, so this dir is excluded from `vue-tsc` and
eslint (see `tsconfig.json` exclude + `eslint.config.js` ignores). The pure,
runtime-free logic these files depend on lives in
`src/utils/cut/fork-logic.ts` and IS unit-tested headless.

**Validation is done by the user locally** — see `LOCAL_VALIDATION.md`.

## Vendoring strategy

We fork by *override*, not by copying all 67 MB of omniclip source:

1. Add `omniclip@1.0.7` + its peer deps as real dependencies (see
   `LOCAL_VALIDATION.md` step 1).
2. Consume omniclip's PUBLIC API (`omnislate.context`, `.state`, `.actions`,
   `.controllers.media`) wherever it suffices — that covers `importFromUrl`
   (mostly) and reading/writing effects for transitions.
3. Where the public API is insufficient (clip context menu, theming inside the
   shadow DOM, the missing transition state), apply the small source patches in
   `patches/`. Each patch file documents the exact omniclip@1.0.7 source path it
   replaces and the diff intent, so re-applying on an omniclip upgrade is
   mechanical. When the fork is promoted to a real git fork these become commits
   on the forked source; here they are vendored override modules.

## Files
- `index.ts` — fork bootstrap, returns `OmniclipForkApi`.
- `capabilities/import-from-url.ts` — fetch → Blob → File → omniclip media import.
- `capabilities/clip-menu.ts` — host menu-item registry + open/close logic.
- `capabilities/transitions.ts` — transition state ops over omniclip effects.
- `patches/effect.patch.ts` — patched clip view: context-menu trigger + items.
- `patches/theme.css.ts` — patched styles exposing `--omni-*` custom props + `::part`.
- `patches/state.patch.ts` — adds `transitions` to historical state + actions.
- `LOCAL_VALIDATION.md` — the exact steps the user runs to validate in a browser.
