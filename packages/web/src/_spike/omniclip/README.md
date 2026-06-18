# omniclip integration spike — GO/NO-GO verdict (openimago-2re7, ADR 0007)

**Throwaway.** Delete this entire `_spike/omniclip/` dir + the `/_spike/omniclip`
route in `src/router/routes.ts` once the gate is decided. Do not build the
production Cut editor here.

## Method

Verified against the actual published package `omniclip@1.0.7` (npm), inspected
from source (`s/*.ts`, the compiled `x/*.js` entry, and `package.json`) rather
than docs. The mapping layer (point 3) is proven by a pure, unit-tested POC
(`cut-omniclip.mapper.ts` + `.spec.ts`, 4 tests green) that does not require
installing omniclip. The embed/ingest path (points 1–2) is documented in
`OmniclipSpikePage.vue` against the verified API.

> Note on the package: `omniclip@1.0.7` is the **whole app** (single version,
> published >1yr ago, 67 MB unpacked, ships a 12 MB sample `bbb_video_avc_frag.mp4`,
> raw `.ts` under `s/`, and bundles `@benev/construct` + `@benev/slate` + ffmpeg
> wasm + fabric + mp4box). It is app-shaped, not a slim component library. The
> GitHub `main` branch is more current than this npm release.

## VERDICT: **CONDITIONAL GO — only via a fork.** Clean npm-as-library adoption is NO-GO.

The mapping/ownership model (the ADR's decisive constraint) is sound and works.
But three of the five points cannot be done against the published package without
forking it. ADR 0007 already anticipates a fork ("Adopt **and if needed fork**").
If the team accepts owning a fork, GO. If the team wanted a drop-in npm dependency,
NO-GO → fall back to route 2 (VideoContext + custom Vue timeline UI).

## Point-by-point

### 1. Embed (register custom elements, mount in Quasar, runs) — **GO, with caveats**
- `omniclip`'s entry (`x/index.js`) calls `register_to_dom({ConstructEditor, OmniTimeline, OmniText, OmniMedia})` as an **import side-effect**, and constructs a **global singleton** `omnislate.context` (`OmniContext`). So importing the package boots an editor app, not a passive component.
- Custom elements (`<construct-editor>`, `<omni-timeline>`, `<omni-media>`, `<omni-text>`) render fine inside a Vue template; Vue passes unknown tags through. Must add `isCustomElement` to the Vue compiler options in `quasar.config.ts` (`omni-*` / `construct-*`) so vue-tsc/compiler don't warn.
- **Caveats that make this non-trivial:**
  - **COOP/COEP required.** It uses WebCodecs + SharedArrayBuffer (ffmpeg.wasm) and ships `coi-serviceworker`. Our app must serve `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (dev server + `nginx.conf`). This is intrusive — cross-origin assets (our CDN media!) then need CORP headers too.
  - **No SSR** — confirmed N/A here (Quasar SPA), but the global singleton + IndexedDB/localStorage on import would break any SSR.
  - **Singleton state** is global, not per-instance — awkward for a tab you mount/unmount; you get one editor for the whole app.

### 2. Feed media from our data (Shot Run URLs as clips) — **NO-GO without a fork**
- omniclip has **no load-from-URL API.** Media is keyed by **content hash**, stored in **IndexedDB as `File` objects**, and imported **only** via an `<input type="file">` change event (`Media.import_file(input: HTMLInputElement)`). It then derives frames/duration/thumbnail with **ffprobe-wasm/WebCodecs client-side**.
- Effects reference media by `file_hash`, never URL. So to place our remote Shot media we must: `fetch(url) → Blob → File →` feed to the media controller `→` wait for `on_media_change` `→` then `actions.add_video_effect(...)`.
- The blocker: `import_file` accepts only an `HTMLInputElement`, so programmatic ingestion needs a synthetic `DataTransfer`-backed input **or** a small fork adding a `File`-taking import method. Workable, but not a public API.

### 3. Map state ↔ EpisodeCut (ownership model A) — **GO (proven)**
- State is fully readable (`omnislate.context.state.effects/tracks`) and writable via documented `actions` (`add_video_effect`, `set_effect_start/end/duration`, `remove_effect`, …), with built-in undo/redo.
- `cut-omniclip.mapper.ts` implements both directions and passes 4 round-trip tests, including unit conversion (EpisodeCut **seconds** ↔ omniclip **milliseconds**) and orphan tolerance (ADR 0006).
- **Two documented gaps:** (a) omniclip 1.0.7 has **no transition primitive** in its state tree, so `CutTransition` cannot round-trip — it must be preserved from canonical `cut.json` (the mapper does this). (b) omniclip auto-persists its own state to `localStorage`; with model A that store is a redundant cache we must keep from fighting `cut.json` (clear/ignore it on open).

### 4. Inject custom clip-menu items (重新生成 / 添加到对话) — **NO-GO without a fork**
- There is **no context menu and no extension/plugin API** anywhere in the source (`grep contextmenu|context_menu|right-click` → zero hits). Clip affordances are inline lit-rendered buttons (add/delete) inside shadow-DOM `shadow_component`s.
- Adding our items means editing omniclip's lit render functions (e.g. `views/effects/parts/effect.ts`) → **fork required.**

### 5. Theming toward dark-neon (shadow DOM reach) — **NO-GO without a fork**
- Components are lit + **shadow DOM**; styles are `css`-tagged templates with **hard-coded hex colors** (`#201f1f`, `green`, `white`, `#333`) and **no CSS custom properties** exposed. Our `--imago-*` tokens cannot pierce the shadow boundary because the styles don't read any custom properties.
- Restyling requires forking the `styles.ts` files (or `::part()` only where omniclip exposes parts — it exposes almost none). **Fork required.**
- One free win: clip styles already expose a `[data-no-file]` state (dotted-red border) — directly reusable for ADR 0006 orphan "missing source" placeholders.

## Recommendation
GO **only if** the team accepts forking omniclip (points 2, 4, 5 each need fork-level
changes; the COOP/COEP requirement in point 1 is intrusive). The ADR's "A" ownership
model is validated and the mapping layer is real and tested. If a fork is unacceptable,
choose route 2 (VideoContext engine + custom Vue timeline UI), which the ADR holds as
the fallback and which gives clean theme + clip-menu control at the cost of more UI code.
