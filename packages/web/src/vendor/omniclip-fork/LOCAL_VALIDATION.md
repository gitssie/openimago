# Local validation checklist — omniclip fork (openimago-uyd0)

This dir is **browser-only** and was written but NOT built/run in the coder
sandbox (no WebCodecs / SharedArrayBuffer / IndexedDB). Run these steps on your
machine in a Chromium-based browser (WebCodecs required). Report back any step
that fails so it can be fixed.

## 1. Install the fork's runtime deps (in `packages/web`)

```bash
cd packages/web
bun add omniclip@1.0.7 @benev/slate @benev/construct lit \
  @ffmpeg/ffmpeg @ffmpeg/util fabric mp4box ffprobe-wasm coi-serviceworker
```

If omniclip's deep imports (`@benev/slate/x/...`, `@benev/construct/x/...`) don't
resolve, also add them explicitly or check the installed versions match
omniclip@1.0.7's `dependencies`.

## 2. Confirm cross-origin isolation is live (from openimago-c80q)

```bash
bun run dev   # from repo root, or `quasar dev` in packages/web
```

In the browser devtools console on any app page:

```js
crossOriginIsolated   // must be true
```

If `false`, the COOP/COEP headers (quasar.config.ts / nginx.conf / Hono
`crossOriginIsolation` middleware) aren't reaching the document — WebCodecs +
ffmpeg.wasm will not work. Also confirm your CDN/backend media responses carry
`Cross-Origin-Resource-Policy` (the Hono middleware sets `cross-origin`).

## 3. Mount the fork on the spike route

The spike page at **`/_spike/omniclip`** has the commented mount point. After
install, uncomment the `<construct-editor>` element and add to the page script:

```ts
import { omniclipFork, applyImagoTheme } from 'src/vendor/omniclip-fork'
// after mount:
applyImagoTheme(document.querySelector('.spike') as HTMLElement)
```

You'll also need to tell Vue these are custom elements — add to
`quasar.config.ts` build:

```ts
viteVuePluginOptions: {
  template: { compilerOptions: { isCustomElement: (t) => t.startsWith('omni-') || t.startsWith('construct-') } },
},
```

Open `http://localhost:7000/#/_spike/omniclip`.

## 4. Validate each capability (click / observe)

| # | Capability | Action | Expected |
|---|---|---|---|
| 1 | **URL import** | In console: `await omniclipFork.importFromUrl('<a real Shot Run mp4 URL>')` then add it to the timeline | A video clip appears on the timeline; `importFromUrl` resolves with `{fileHash, frames, rawDurationSeconds, thumbnail, name}` |
| 2 | **Clip menu** | Register items, then right-click a clip: `omniclipFork.registerClipMenuItems([{id:'regen',label:'重新生成',onSelect:console.log},{id:'chat',label:'添加到对话',onSelect:console.log}])` | A context menu opens at the cursor showing 重新生成 / 添加到对话; clicking logs the `{effectId, sourceShotId}` ctx |
| 3 | **Theming** | With `applyImagoTheme` applied | Editor background + clip fill/border + selected-clip accent use the dark-neon `--imago-*` tokens (cyan accent), not omniclip's default `#201f1f`/white |
| 4 | **Orphan placeholder** | Add a clip, then make its source unavailable (or import a clip whose file is later removed) | The clip renders with the dotted `--imago-neon-pink` border ([data-no-file] reused) |
| 5 | **Transition** | `omniclipFork.setTransition({afterEffectId:'<clip id>', kind:'dissolve', durationMs:500})` then play | A dissolve plays between the two adjacent clips; `omniclipFork.readTransitions()` returns it; `clearTransition(id)` removes it; undo/redo restores it |

## 5. Build check

```bash
cd packages/web && bun run build   # quasar build must succeed with the fork imported
```

## Notes / known risks to verify
- `importFromUrl` feeds omniclip via a **synthetic `<input>`/DataTransfer**; if a
  browser rejects programmatic `input.files`, switch to the forked
  `import_file_from_file(file)` method (patches/README path) instead.
- The transition primitive needs `patches/state.patch.ts` actually spliced into
  omniclip's `state.ts`/`types.ts`/`actions.ts` (this repo vendors them as
  override modules; a real git fork applies them as source edits). `setTransition`
  calls `actions.add_transition`, which only exists after that splice.
- The patched clip view (`patches/effect.patch.ts`) must replace the original
  `Effect` view for the right-click menu + `::part` to take effect.
