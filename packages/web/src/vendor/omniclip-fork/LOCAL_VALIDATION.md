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
> to the allowlist, so all other package resolution is untouched. It returns the
> REAL store path (`realpathSync`), not the `packages/web/node_modules` symlink,
> so Vite serves these via `/@fs/<abs>` rather than a `/node_modules/<pkg>` URL —
> the latter makes browser `import()` reject large single-line modules (e.g.
> ffprobe-wasm's 4.29MB `browser.mjs`) instantly. (openimago-9lpk) Already in the
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

## 3. Mount the fork in the production Cut panel

The throwaway `/_spike/omniclip` page was removed in openimago-lile; the fork now
mounts in production via **`StoryCutPanel.vue`** (`mountAndHydrate` dynamic-imports
`src/vendor/omniclip-fork/load.ts`, applies the theme, and subscribes
`fork.onEdit`). To validate, open an episode's 时间线 tab with a non-empty Cut so
the panel mounts `<construct-editor>`.

Vue is already told these are custom elements — `quasar.config.ts` build sets:

```ts
viteVuePluginOptions: {
  template: { compilerOptions: { isCustomElement: (t) => t.startsWith('omni-') || t.startsWith('construct-') } },
},
```

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

## Runtime integration (openimago-1mcb — how the capabilities reach omniclip)
- **importFromUrl** is DETERMINISTIC: it computes `quick_hash(file)` + ffprobe
  frames itself, writes the record to omniclip's `"database"` IndexedDB store
  (same shape `import_file` writes), `media.set(hash, file)`s the controller Map,
  publishes `on_media_change("added")` so omniclip's own video-effect/compositor
  listeners compose the clip, then resolves with the computed facts. It does NOT
  await `on_media_change` (which never fires for a programmatic add — the old
  synthetic-`<input>` approach timed out at 60s).
- **Transitions** are NOT omniclip actions (its AppCore actions are sealed at
  construction — injecting `add_transition` threw). The fork owns the live
  transition view-state in a per-context WeakMap store via the unit-tested
  `upsert/removeTransition` reducers; `cut.json` stays canonical (the panel
  persists every transition through the cut endpoints).
- **Clip context menu** is a document-level `contextmenu` listener (capture)
  installed at boot; it finds `.effect` via `composedPath()` (pierces the shadow
  DOM), resolves the clicked effect id from `state.selected_effect`, maps it to a
  sourceShotId via the host resolver (`setClipContextResolver`), and renders the
  registry's `visibleItems(ctx)` as a light-DOM overlay. The sealed Effect
  `shadow_view` is NOT patched.
- The `patches/*.ts` files remain as documentation of the source-vendor
  alternative; the runtime integration above is what actually ships.

### Verify in-browser (the §4 items above, after this fix)
- `importFromUrl` resolves within a few seconds (no 60s hang) and the clip lands.
- Right-click a clip → the 4-item menu appears; `setTransition`/`clearTransition`/
  `readTransitions` work without "is not a function".

---

## 6. Panel-level validation (openimago-4eiw — StoryCutPanel in the 时间线 tab)

The Cut editor now lives in the project workspace **时间线** tab, replacing the
old workflow-DAG panel. The panel (`StoryCutPanel.vue`) hydrates from `cut.json`,
mounts the fork's `<construct-editor>`, and persists edits via the cut endpoints
with the cut's own optimistic-concurrency clock. Wiring logic (mapper, media
resolver, edit dispatcher, 409 retry, hydration payload builder) is unit-tested
in `src/utils/cut/`; the mounted editor + the editor→`persistEdit` event bridge
are browser-validated.

> **Mount + hydration now real (openimago-addv):** the 4eiw scaffold left the
> mount as a stub. The panel now (1) loads the fork in `onMounted`/`nextTick`
> (so the `editorHost` div exists — the previous `immediate` watch ran during
> `setup()` before the ref bound and early-returned), (2) renders
> `<construct-editor v-if="editorReady">`, and (3) hydrates: `buildHydrationPayload`
> (pure, tested) maps `cut.json` → the fork's `hydrateFromCut(clips, transitions)`,
> which `importFromUrl`s each clip's media and places it as a trimmed effect, then
> applies transitions. The editor→`persistEdit` event bridge (omniclip
> effect-change → `CutEdit`) is the last browser-side wiring to confirm.

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
| 9 | **Clip filmstrips** (openimago-vwjl) | After assemble/hydrate, look at each clip at rest (no playback) | Every clip's `.filmstrip` shows video frame thumbnails (`<img class="thumbnail">` with a data-URL `src`), NOT an empty solid block. Two-part fix: (1) import-from-url.ts calls `media.get_imported_files()` so `media.get_file()` resolves (`#files_ready` was never set by the raw `media.set()`); (2) hydrate-from-cut.ts, after the views mount, DELETES each effect from `compositor.managers.videoManager` (so the VideoEffect's `!is_effect_already_composed` strip-draw guard passes — by re-publish time all effects are already composed) then re-publishes `on_media_change("added")`; the listener re-inits the strip + re-composes the effect via `compositor.recreate` |
| 10 | **Filmstrip 9:16, dense edge-to-edge, not stretched** (openimago-audw / fhnz / 6br9) | Inspect a clip's `.filmstrip` `<img class="thumbnail">` frames (portrait shot videos); scroll the timeline horizontally | Each frame is a 28×50 9:16 CENTER-COVER crop rendered at 28px wide, and frames TILE CONTINUOUSLY edge-to-edge with NO black gaps (a real-NLE strip) — not sparse 28px frames in ~116px slots. Density: `frames_count` is a LIVE GETTER = `clamp(ceil(effect_width/28),1,600)`, and `effect_width` returns the REAL rendered px the view lays clips out at — `(effect.end-effect.start) * 2^(live state.zoom)` (omniclip's `calculate_effect_width`), NOT a hardcoded `2^2` (that only matched at zoom===2 → wide slots/gaps at other zooms). The VideoEffect view positions+sizes each cell at `filmstrip.effect_width / filmstrip.frames_count` reading THESE getters, so the rendered slot is exactly ≈28px. `#width_of_frame` derives from the same live `frames_count`; `#get_filmstrip_frame_at` divides by the same. (Earlier reopen: a frozen count + duration*4 width → measured 46.9/37.1px slots; now ≈28.) Frames are still un-stretched (`effect-styles.patch.ts` pins `.thumbnail { width:28px !important; object-fit:cover }`). Horizontal scroll keeps frames aligned. Confirm: adjacent `<img>`s butt together (translateX deltas ≈ 28px across clips of DIFFERENT widths), no gap. Not-yet-drawn cells show a CLEAN dark slot, never a broken-image icon: placeholders are a baked 28×50 canvas data-URL (`#14141f` ≈ raised lane), NOT `${location.href}/assets/loading.svg` (which 404s under hash routing). Confirm no `<img naturalWidth=0>` / broken icons; visible cells fill with frames (the refreshFilmstrips re-publish runs a full visible recalc per clip after extraction). Frame CONTENT: every drawn cell shows REAL video pixels, no blank/white frames — the per-cell draw AWAITS the seek (`#seek_and_wait`: one-shot `seeked` + 1.5s timeout fallback + a requestVideoFrameCallback/rAF so the frame is decoded/presentable) BEFORE `drawImage`, and the recalc loop awaits each so dense seeks don't stomp the shared `<video>`. Confirm pixel-variance across ALL clips (not just the first) — no uniform-white cells. |
| 11 | **Clip imago styling** (openimago-fhnz) | Select a clip; compare selected vs unselected. FIRST confirm `effect-styles.patch.ts` actually loaded (Network: the patch module is fetched; clip bg is NOT `#201f1f`, selected ring is NOT white) | Default clip: `--imago-bg-surface` fill + 1px `--imago-border-soft` border. Selected clip: cyan ring (`--imago-border-cyan-active`) + soft cyan glow (matches the left-panel active card). Orphan/missing-source clip: theme pink (`--imago-neon-pink`) dotted border, not raw red. Swapped omniclip's effect `styles` (injected via `use.styles` into the clip shadow root) through `omniclipEffectStylesPatch` → `patches/effect-styles.patch.ts` (re-exports upstream `styles` + appends imago overrides; `var(--imago-*)` inherit through the shadow boundary, no `part=`). NOTE: effect.js imports styles RELATIVELY (`./styles.js`), so the resolveId guard matches the bare `styles.js` tail gated on an `effects/parts/effect.js` importer — matching only `views/effects/parts/styles.js` (the earlier bug) never fired. |

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
