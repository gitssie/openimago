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

> **omniclip dep resolution (openimago-ulkx/y90v/g015):** `quasar.config.ts`
> handles the whole omniclip vendor set (`omniclip`, `@benev/slate`,
> `@benev/construct`, `ffprobe-wasm`, `fabric`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`)
> in two ways. (1) They're in `optimizeDeps.exclude` — they ship pre-built
> bundles + sibling wasm/worker assets; pre-bundling them times out (504 on
> omniclip) or relocates assets. (2) A scoped `omniclip-subpath-resolver` Vite
> plugin rewrites any `<vendorPkg>/<subpath>` (e.g. `fabric/dist/fabric.mjs`,
> `ffprobe-wasm/browser.mjs`) → its physical `node_modules` file, because these
> packages' `exports` maps lack sub-path keys and Vite 8 strict-exports rejects
> them (HTML/500 instead of JS → the dynamic import fails). The plugin is scoped
> to the allowlist, so all other package resolution is untouched. Already in the
> repo; confirm present after install.

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

---

## 6. Panel-level validation (openimago-4eiw — StoryCutPanel in the 时间线 tab)

The Cut editor now lives in the project workspace **时间线** tab, replacing the
old workflow-DAG panel. The panel (`StoryCutPanel.vue`) hydrates from `cut.json`,
mounts the fork's `<construct-editor>`, and persists edits via the cut endpoints
with the cut's own optimistic-concurrency clock. Wiring logic (mapper, media
resolver, edit dispatcher, 409 retry) is unit-tested in `src/utils/cut/`; the
mounted editor + the editor→`persistEdit` event bridge are browser-validated.

Run on a project that has an episode with at least one **completed** shot run
(so there is media to cut), in a Chromium browser with `crossOriginIsolated`.

| # | Check | Action | Expected |
|---|---|---|---|
| 1 | **Empty → assemble** | Open 时间线 for an episode with no cut yet | "尚未生成粗剪" empty state with **自动拼接粗剪**; clicking it calls `assembleEpisodeCut`, the cut appears, editor mounts |
| 2 | **Hydrate from cut.json** | Open 时间线 for an episode that already has a cut | Clips from `cut.json` appear on the timeline in `order`, each trimmed to its in/out, sourced from the shot's latest completed run preview |
| 3 | **Edit persists** | Reorder / trim / split / delete a clip (wire the editor event to `panel.persistEdit({kind,...})`) | The matching cut endpoint is called with `expectedUpdatedAt`; on success the page refetches and the change sticks |
| 4 | **Survives reload** | After an edit, switch episodes and back (or reload) | The edit is still there (it was persisted to `cut.json`, not just editor-local) |
| 5 | **409 conflict** | Force a stale write (edit, then edit again from another tab) | First write 409s → panel refetches the cut + retries once; a persistent conflict shows "该粗剪已被更新，请重试" and refetches |
| 6 | **Orphan clip** | Delete a Shot that a clip references, then open 时间线 | An orange banner reports N missing-source clips; the orphan renders greyed with the `--imago-neon-pink` dotted border (data-no-file path) — it is NOT dropped |
| 7 | **Transition round-trip** | Set a dissolve between two clips, reload | `setCutTransition` persisted it; on reload the transition is still present |
| 8 | **Theming** | With the editor mounted | Editor background/clips/accent use the dark-neon `--imago-*` tokens (cyan accent, not omniclip default) |

Note: the editor→`persistEdit` event bridge (mapping omniclip's drag/trim/split
DOM events to `CutEdit` objects) is finalised during local validation — the panel
exposes `persistEdit(edit: CutEdit)` via `defineExpose` and the tested dispatcher
routes each `CutEdit` to its endpoint. Connect omniclip's effect-change events to
it once the editor is running.

---

## 7. Clip context menu + 添加到对话 (openimago-e0n3 — closes the Cut line)

The panel registers a per-clip context menu via the fork's
`registerClipMenuItems` hook at mount. Items + orphan-gating + action routing are
unit-tested (`src/utils/cut/clip-menu-items.ts`, `clip-reference.ts`); the menu
rendering + tab switch are browser-validated. The 添加到对话 path is a NON-upload
reference: it builds an already-`'uploaded'` PendingAttachment from the clip's
source-shot media artifact (url+mime+assetId) and pushes it straight into
`pendingAttachments` via the new `addReferenceAttachment` (no `api.uploadAsset`).

| # | Check | Action | Expected |
|---|---|---|---|
| 1 | **Menu appears** | Right-click a clip | A context menu with exactly 4 items: 添加到对话 / 重新生成 / 手动编辑 / 删除 |
| 2 | **重新生成** | Click 重新生成 | `api.generateShot(sourceShotId)` runs; the shot regenerates and the clip's media refreshes |
| 3 | **手动编辑** | Click 手动编辑, edit the prompt | `api.updateShot` persists the new shot description |
| 4 | **删除 removes CLIP only** | Click 删除 on a clip | The clip disappears from the timeline (deleteCutClip), but the SOURCE SHOT still exists in 故事板 (NOT deleted) |
| 5 | **添加到对话** | Click 添加到对话 | The view switches to the 对话 tab; the clip's media shows as a reference chip in the composer (the '拖拽素材到此处作为参考' area) with NO upload progress (already uploaded); composer is seeded with the shot description if empty |
| 6 | **No re-upload** | Watch the network tab during 添加到对话 | NO `POST` to the asset-upload endpoint — the existing artifact url/assetId is reused |
| 7 | **Dedupe** | 添加到对话 twice on the same clip | Only one reference chip (de-duped by assetId/url) |
| 8 | **Orphan clip menu** | Right-click an orphan clip (source shot deleted) | 重新生成 / 手动编辑 / 添加到对话 are hidden; only 删除 remains, and it removes the orphan clip |
