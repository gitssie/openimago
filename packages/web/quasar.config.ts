// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '#q-app/wrappers';
import { fileURLToPath } from 'node:url';
import { existsSync, realpathSync, readdirSync } from 'node:fs';

// ── omniclip vendor dependency set (ADR 0007, openimago-ulkx/y90v/g015) ──────
// The vendored omniclip fork pulls these. They ship pre-built bundles + sibling
// wasm/worker assets and have `exports` maps that omit sub-path keys, which
// Vite 8 strict-exports rejects. They are (a) excluded from the dep optimizer
// and (b) handled by the scoped sub-path resolver below.
const OMNICLIP_VENDOR_PKGS = [
  'omniclip',
  '@benev/slate',
  '@benev/construct',
  'ffprobe-wasm',
  'fabric',
  '@ffmpeg/ffmpeg',
  '@ffmpeg/util',
  // wavesurfer.js is an omniclip transitive dep (the BGM waveform). The fork's
  // waveform patch imports it from a src/ importer, so it must be excluded from
  // the dep optimizer + resolved via the subpath resolver like the rest of the
  // omniclip vendor set (openimago-r7to).
  'wavesurfer.js',
] as const;

/**
 * Vite plugin: for the omniclip vendor set ONLY, resolve a bare
 * `<pkg>/<subpath>` specifier to its physical node_modules file. Bypasses the
 * packages' incomplete `exports` maps without per-path aliases or whack-a-mole.
 * Returns undefined for anything outside the allowlist (and for bare-package
 * imports with no sub-path), leaving normal resolution untouched.
 *
 * CRITICAL (openimago-9lpk): return the REAL path (realpathSync), not the
 * symlink path under `packages/web/node_modules`. These packages are bun-store
 * symlinks; the symlink path is INSIDE the Vite root, so Vite serves it as a
 * `/node_modules/<pkg>` dev URL — and browser `import()` rejects that URL for
 * large single-line modules (e.g. ffprobe-wasm's 4.29MB base64 `browser.mjs`)
 * with an instant SyntaxError. The real store path is OUTSIDE the root, so Vite
 * serves it via `/@fs/<abs>`, which loads correctly (matching the old
 * resolve.alias behaviour). This also fixes ffprobe's RUNTIME import, not just
 * module load. Returning a bare path (not {external:true}) keeps Vite serving.
 */
function omniclipSubpathResolver() {
  return {
    name: 'omniclip-subpath-resolver',
    enforce: 'pre' as const,
    resolveId(source: string) {
      const pkg = OMNICLIP_VENDOR_PKGS.find(
        (p) => source.startsWith(`${p}/`) && source.length > p.length + 1,
      );
      if (!pkg) return undefined;
      // Prefer the web-local node_modules. For deps hoisted out of the package
      // (e.g. wavesurfer.js lives ONLY in the workspace-root bun store, not under
      // packages/web/node_modules and not node-resolvable from web — omniclip only
      // reaches it via its runtime importmap; openimago-r7to), fall back to the
      // bun store: node_modules/.bun/<pkg>@<version>/node_modules/<source>. Either
      // way realpathSync to the store path (outside the Vite root) → /@fs/.
      const local = fileURLToPath(new URL(`./node_modules/${source}`, import.meta.url));
      if (existsSync(local)) return realpathSync(local);
      // The bun store lives at the MONOREPO ROOT (../../node_modules/.bun/), not
      // per-package. Match `<pkg>@<version>` dirs (bun flattens scoped names, e.g.
      // '@ffmpeg/util' → '@ffmpeg+util@x'); take the newest, then the subpath.
      const bunStore = fileURLToPath(new URL('../../node_modules/.bun/', import.meta.url));
      if (existsSync(bunStore)) {
        const flat = pkg.replace('/', '+');
        const prefix = `${flat}@`;
        const match = readdirSync(bunStore)
          .filter((d) => d.startsWith(prefix))
          .sort()
          .pop();
        if (match) {
          const storePath = fileURLToPath(
            new URL(`../../node_modules/.bun/${match}/node_modules/${source}`, import.meta.url),
          );
          if (existsSync(storePath)) return realpathSync(storePath);
        }
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's bundled `VideoEffect` timeline view for the fork's
 * STATIC sprite-sheet filmstrip (openimago-78m9). Replaces the WebCodecs
 * client-side frame extraction (seek/draw per cell → lag/flicker/white frames)
 * with a precomputed sprite rendered via CSS background-position. omni-timeline's
 * component.js imports the view via a RELATIVE `./views/effects/video-effect.js`,
 * so match that tail gated on an omniclip importer. The fork patch re-imports
 * upstream omniclip modules (Effect, shadow_view, calculate_effect_width) from a
 * src/ importer, which isOmniclipPackageImporter excludes → no redirect loop.
 */
function omniclipVideoEffectPatch() {
  const FORK_VIDEO_EFFECT = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/video-effect.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-video-effect-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)(views\/effects\/)?video-effect\.js$/.test(source)
      ) {
        return FORK_VIDEO_EFFECT;
      }
      return undefined;
    },
  };
}

/**
 * True only when the importer is a file INSIDE the omniclip npm package — not the
 * vendored fork (whose path also contains the substring "omniclip"). The fork's
 * patch modules re-import upstream omniclip modules; guarding on the real package
 * path prevents a self-redirect loop.
 */
function isOmniclipPackageImporter(importer: string): boolean {
  return /node_modules\/[^/]*omniclip[^/]*\//.test(importer) && !importer.includes('omniclip-fork');
}

/**
 * Vite plugin: swap omniclip's clip/effect shadow-DOM styles for the fork's
 * imago-themed ones (openimago-fhnz). omniclip's effect view does
 * `use.styles([..., styles])` from
 * .../views/effects/parts/styles.js — injecting that CSS into the clip's shadow
 * root. var(--imago-*) inherit through the shadow boundary, so the fork patch
 * re-exports omniclip's `styles` + appends imago overrides (cyan selected ring,
 * soft default border, theme orphan color). Scoped to the omniclip importer +
 * the exact styles sub-path; the fork patch itself imports the upstream styles,
 * but from a src/ importer (not "omniclip"), so it is NOT redirected → no loop.
 */
function omniclipEffectStylesPatch() {
  const FORK_EFFECT_STYLES = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/effect-styles.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-effect-styles-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      // effect.js imports the clip styles as a RELATIVE specifier
      // (`import { styles } from "./styles.js"`), so Vite passes raw "./styles.js"
      // here — it does NOT contain "views/effects/parts/". Match the bare/relative
      // `styles.js` tail and GATE on the importer being effects/parts/effect.js
      // (the only consumer). isOmniclipPackageImporter keeps the fork's own
      // upstream re-import (importer = src/) from being redirected → no loop.
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)(views\/effects\/parts\/)?styles\.js$/.test(source) &&
        /views\/effects\/parts\/effect\.js/.test(importer)
      ) {
        return FORK_EFFECT_STYLES;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's timeline TOOLBAR view for the fork's single
 * combined control bar (openimago-4qwj). The approved design merges the playback
 * transport (in the media-player pane's shadow root) with the timeline toolbar
 * (zoom/time) into ONE bar; since those are separate shadow roots, CSS can't
 * relocate nodes, so the fork toolbar view re-renders the transport from the
 * shared omnislate context. omni-timeline's component.js imports the toolbar as a
 * RELATIVE `import { Toolbar } from "./views/toolbar/view.js"`, so Vite passes raw
 * "./views/toolbar/view.js" here — GATE on the importer being
 * omni-timeline/component.js so this does NOT collide with the styles/view-effect
 * patches (whose importers are the per-view view.js / effect.js files).
 * isOmniclipPackageImporter keeps the fork's own upstream re-imports (importer =
 * src/) from being redirected → no loop.
 */
function omniclipToolbarPatch() {
  const FORK_TOOLBAR = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/toolbar.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-toolbar-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      // component.js imports each view by its FULL relative subpath
      // (`./views/toolbar/view.js`), so REQUIRE the `views/toolbar/` segment —
      // a bare `view\.js$` would also match the sibling track/playhead/time-ruler
      // view imports from the same component.js and mis-redirect them.
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)views\/toolbar\/view\.js$/.test(source) &&
        /omni-timeline\/component\.js/.test(importer)
      ) {
        return FORK_TOOLBAR;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's playhead shadow-DOM styles for the fork's
 * white-playhead override (openimago-h9pt). omniclip hardcodes `background:
 * yellow` / `color: yellow` as CSS literals in
 * .../views/playhead/styles.js, so theme vars cannot reach them. playhead/view.js
 * imports them as a RELATIVE `import { styles } from "./styles.js"`, so Vite
 * passes raw "./styles.js" here — GATE on the importer being views/playhead/view.js
 * so this does NOT collide with omniclipEffectStylesPatch (whose importer is
 * effects/parts/effect.js). isOmniclipPackageImporter keeps the fork's own
 * upstream re-import (importer = src/) from being redirected → no loop.
 */
function omniclipPlayheadStylesPatch() {
  const FORK_PLAYHEAD_STYLES = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/playhead-styles.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-playhead-styles-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)(views\/playhead\/)?styles\.js$/.test(source) &&
        /views\/playhead\/view\.js/.test(importer)
      ) {
        return FORK_PLAYHEAD_STYLES;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's media-player shadow-DOM styles for the fork's
 * portrait 9:16 override (openimago-vm5v). omniclip hardcodes `aspect-ratio:16/9`
 * on figure/.canvas-container in .../views/media-player/styles.js, so a portrait
 * project letterboxes. media-player/view.js imports them as a RELATIVE
 * `import { styles } from "./styles.js"`, so GATE on the importer being
 * views/media-player/view.js — distinct from the effect-styles gate
 * (effects/parts/effect.js) and the playhead gate (views/playhead/view.js), so
 * the three styles.js patches never cross-fire. isOmniclipPackageImporter keeps
 * the fork's own upstream re-import (importer = src/) from being redirected.
 */
function omniclipMediaPlayerStylesPatch() {
  const FORK_MEDIA_PLAYER_STYLES = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/media-player-styles.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-media-player-styles-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)(views\/media-player\/)?styles\.js$/.test(source) &&
        /views\/media-player\/view\.js/.test(importer)
      ) {
        return FORK_MEDIA_PLAYER_STYLES;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's BGM waveform (WaveSurfer) for the fork's green
 * version (openimago-r7to). omniclip's Waveform set no waveColor, so the lane
 * rendered in WaveSurfer's near-invisible default gray on the dark navy lane and
 * read as blank. The audio-effect view imports it as a RELATIVE
 * `import { Waveform } from "../../../../context/controllers/timeline/parts/waveform.js"`,
 * so Vite passes that path here — GATE on the importer being the audio-effect view
 * + the `controllers/timeline/parts/waveform.js` source tail, distinct from every
 * other patch's gate so none cross-fire. isOmniclipPackageImporter keeps the
 * fork's own upstream re-imports (importer = src/) from being redirected.
 */
function omniclipWaveformPatch() {
  const FORK_WAVEFORM = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/waveform.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-waveform-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)controllers\/timeline\/parts\/waveform\.js$/.test(source) &&
        /views\/effects\/audio-effect\.js/.test(importer)
      ) {
        return FORK_WAVEFORM;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's track VIEW for the fork's version that adds the
 * left TRACK-HEADER GUTTER (per-track icon column) (openimago-8qmq). The approved
 * reference shows each track with a narrow left icon column (video=clip+speaker,
 * BGM=music note+speaker, empty=waveform); upstream renders a bare 50px track div
 * with no gutter. omni-timeline's component.js imports the track view as a
 * RELATIVE `import { Track } from "./views/track/view.js"`, so Vite passes raw
 * "./views/track/view.js" here — GATE on the importer being
 * omni-timeline/component.js + REQUIRE the `views/track/` segment so this does NOT
 * collide with the toolbar gate (views/toolbar/) or the per-view styles gates.
 * isOmniclipPackageImporter keeps the fork's own upstream re-imports (importer =
 * src/) from being redirected → no loop. The fork view is OVERLAY-ONLY (sticky
 * chip), so it does NOT shift the timeline origin omniclip's drag math depends on.
 */
function omniclipTrackViewPatch() {
  const FORK_TRACK_VIEW = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/track-view.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-track-view-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)views\/track\/view\.js$/.test(source) &&
        /omni-timeline\/component\.js/.test(importer)
      ) {
        return FORK_TRACK_VIEW;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's omni-timeline COMPONENT styles for the fork's
 * version that reserves a real left GUTTER (openimago-scml). The fork patch
 * re-exports upstream `styles` + appends `padding-left: GUTTER_PX` on `.timeline`,
 * which shifts `.timeline-relative` (its absolute effects + the drag bounds, in
 * lockstep) AND the time-ruler + toolbar right by the same amount — coordinate-math
 * safe (parent padding, not padding on `.timeline-relative`; see the patch header).
 * The track-header chip (track-view.patch.ts) is then pinned into that opened band.
 *
 * omni-timeline's component.js imports these as a RELATIVE
 * `import { styles } from "./styles.js"`, so Vite passes raw "./styles.js" here —
 * GATE on the importer being omni-timeline/component.js. The other styles.js
 * patches gate on a `views/<name>/view.js` (or `effects/parts/effect.js`) importer
 * and the track-view patch gates on a `views/track/` SOURCE, so none cross-fire
 * with this component-level styles gate. isOmniclipPackageImporter keeps the fork's
 * own upstream re-import (importer = src/) from being redirected → no loop.
 */
function omniclipTimelineStylesPatch() {
  const FORK_TIMELINE_STYLES = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/omni-timeline-styles.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-timeline-styles-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)styles\.js$/.test(source) &&
        /omni-timeline\/component\.js/.test(importer)
      ) {
        return FORK_TIMELINE_STYLES;
      }
      return undefined;
    },
  };
}

/**
 * Vite plugin: swap omniclip's VideoManager for the fork's cover-fit subclass
 * (openimago-ua5d). compositor/controller.js imports it as a RELATIVE
 * `import { VideoManager } from "./parts/video-manager.js"`, so GATE on the
 * importer being compositor/controller.js + the `video-manager.js` source tail —
 * distinct from the four styles/view patches, so no cross-fire. The fork patch
 * subclasses the upstream VideoManager imported from a src/ importer (not
 * redirected by isOmniclipPackageImporter) → no loop. add_video_effect is the
 * single FabricImage creation point, so cover-fit applied there is race-free.
 */
function omniclipVideoManagerPatch() {
  const FORK_VIDEO_MANAGER = fileURLToPath(
    new URL(
      './src/vendor/omniclip-fork/patches/video-manager.patch.ts',
      import.meta.url,
    ),
  );
  return {
    name: 'omniclip-video-manager-patch',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      if (
        importer &&
        isOmniclipPackageImporter(importer) &&
        /(^|\/)(parts\/)?video-manager\.js$/.test(source) &&
        /compositor\/controller\.js/.test(importer)
      ) {
        return FORK_VIDEO_MANAGER;
      }
      return undefined;
    },
  };
}

export default defineConfig((ctx) => {
  return {
    // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
    // preFetch: true,

    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://v2.quasar.dev/quasar-cli-vite/boot-files
    boot: ['i18n', 'dark'],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#css
    css: ['app.scss'],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v7',
      // 'fontawesome-v6',
      // 'eva-icons',
      // 'themify',
      // 'line-awesome',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      'roboto-font', // optional, you are not bound to it
      'material-icons', // optional, you are not bound to it
    ],

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#build
    build: {
      target: {
        browser: 'baseline-widely-available',
        node: 'node22',
      },

      typescript: {
        strict: true,
        vueShim: true,
        // extendTsConfig (tsConfig) {}
      },

      vueRouterMode: 'hash', // available values: 'hash', 'history'
      // vueRouterBase,
      // vueDevtools,
      // vueOptionsAPI: false,

      // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

      // publicPath: '/',
      // analyze: true,
      // env: {},
      // rawDefine: {}
      // ignorePublicFolder: true,
      // minify: false,
      // polyfillModulePreload: true,
      // distDir

      // extendViteConf (viteConf) {},
      viteVuePluginOptions: {
        template: {
          compilerOptions: {
            isCustomElement: (t: string) =>
              t.startsWith('omni-') || t.startsWith('construct-'),
          },
        },
      },

      extendViteConf(viteConf) {
        viteConf.server = viteConf.server || {}
        viteConf.server.fs = {
          allow: ['..', '../..'],
        }
        // Cross-origin isolation for the omniclip Cut editor (ADR 0007):
        // SharedArrayBuffer + WebCodecs + ffmpeg.wasm require the document to
        // be cross-origin-isolated. The dev server must send these so the
        // editor route works under `quasar dev`. Mirrors the prod nginx serve
        // and the Hono backend middleware. (openimago-c80q)
        viteConf.server.headers = {
          ...(viteConf.server.headers || {}),
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        }
        // Keep the omniclip fork out of Vite's dep pre-optimizer (openimago-ulkx).
        // omniclip ships a pre-built bundle and transitively pulls @benev/slate,
        // @benev/construct and deep component trees; letting esbuild pre-bundle
        // it times out the optimizer (504 on GET /deps/omniclip.js) so
        // <construct-editor> never mounts. Exclude → Vite serves it as-is.
        // Keep the omniclip dep set out of Vite's dep pre-optimizer
        // (openimago-ulkx/y90v/g015). These ship pre-built bundles + sibling
        // .wasm/worker assets; letting esbuild pre-bundle them either times out
        // (504 on omniclip) or relocates assets away from their .mjs. Excluded
        // → Vite serves them as-is and the resolve plugin below fixes sub-paths.
        viteConf.optimizeDeps = {
          ...(viteConf.optimizeDeps || {}),
          exclude: [
            ...((viteConf.optimizeDeps && viteConf.optimizeDeps.exclude) || []),
            ...OMNICLIP_VENDOR_PKGS,
          ],
        }
        // DURABLE fix for the recurring sub-path bug (openimago-y90v → g015):
        // packages in the omniclip dep set ship physical sub-path files (e.g.
        // `ffprobe-wasm/browser.mjs`, `fabric/dist/fabric.mjs`) but their
        // `exports` maps lack those path keys, so Vite 8 strict-exports rejects
        // the import (HTML/500 instead of JS → the dynamic import fails). Rather
        // than alias each sub-path one-by-one, a single scoped resolve plugin
        // rewrites ANY `<allowlistedPkg>/<subpath>` → its physical node_modules
        // file. Scoped to the omniclip vendor set so normal resolution of every
        // other package is untouched.
        viteConf.plugins = viteConf.plugins || []
        viteConf.plugins.push(omniclipSubpathResolver())
        // Swap omniclip's VideoEffect view for the fork's static sprite-sheet
        // filmstrip (openimago-78m9) and its clip styles for the imago-themed
        // ones (openimago-fhnz). unshift so these enforce:'pre' redirects run
        // before the subpath resolver touches omniclip's own deep imports.
        viteConf.plugins.unshift(omniclipVideoEffectPatch())
        viteConf.plugins.unshift(omniclipEffectStylesPatch())
        // Single combined control bar instead of omniclip's split transport +
        // toolbar (openimago-4qwj). Gated on the omni-timeline/component.js
        // importer + the views/toolbar/view.js source, distinct from the other
        // styles/view-effect gates, so the patches never cross-fire.
        viteConf.plugins.unshift(omniclipToolbarPatch())
        // White timeline playhead instead of omniclip's hardcoded yellow
        // (openimago-h9pt). Gated on the playhead view.js importer so it does
        // NOT collide with omniclipEffectStylesPatch's effect.js gate.
        viteConf.plugins.unshift(omniclipPlayheadStylesPatch())
        // Portrait 9:16 preview canvas instead of omniclip's hardcoded 16:9
        // (openimago-vm5v). Gated on the media-player view.js importer so it does
        // NOT collide with the effect-styles or playhead styles.js gates.
        viteConf.plugins.unshift(omniclipMediaPlayerStylesPatch())
        // Cover-fit each preview video at its FabricImage creation point
        // (openimago-ua5d). Gated on the compositor/controller.js importer +
        // video-manager.js source, distinct from the styles/view-effect gates.
        viteConf.plugins.unshift(omniclipVideoManagerPatch())
        // Green BGM waveform instead of omniclip's color-less (invisible) one
        // (openimago-r7to). Gated on the audio-effect.js importer +
        // controllers/timeline/parts/waveform.js source, distinct from the other
        // gates so none cross-fire.
        viteConf.plugins.unshift(omniclipWaveformPatch())
        // Left track-header gutter (per-track icon column) so each track shows
        // its kind icon + speaker, matching docs/images/cut_panel.png
        // (openimago-8qmq). Gated on the omni-timeline/component.js importer +
        // views/track/view.js source, distinct from the toolbar (views/toolbar/)
        // and per-view styles gates, so none cross-fire. The chip is now pinned
        // into the REAL reserved gutter opened by omniclipTimelineStylesPatch
        // below (openimago-scml) — no longer an overlay painting over clips.
        viteConf.plugins.unshift(omniclipTrackViewPatch())
        // Reserve the real left GUTTER: left-pad the `.timeline` flex column by
        // GUTTER_PX (openimago-scml). Coordinate-math safe — parent padding shifts
        // `.timeline-relative` (its absolute effects + the drag bounds, in lockstep)
        // AND the ruler + toolbar by the same amount, so clip render === drag hit and
        // ticks stay aligned. Gated on the omni-timeline/component.js importer +
        // bare styles.js source, distinct from the per-view styles gates
        // (views/<name>/view.js importers) and the track-view gate (views/track/
        // source), so none cross-fire.
        viteConf.plugins.unshift(omniclipTimelineStylesPatch())
      },

      vitePlugins: [
        ctx.dev
          ? [
              'vite-plugin-vue-devtools',
              {
                componentInspector: {
                  cleanHtml: false,
                },
              },
              { client: true },
            ]
          : false,

        [
          '@intlify/unplugin-vue-i18n/vite',
          {
            // if you want to use Vue I18n Legacy API, you need to set `compositionOnly: false`
            // compositionOnly: false,

            // if you want to use named tokens in your Vue I18n messages, such as 'Hello {name}',
            // you need to set `runtimeOnly: false`
            // runtimeOnly: false,

            ssr: ctx.modeName === 'ssr',

            // you need to set i18n resource including paths !
            include: [fileURLToPath(new URL('./src/i18n', import.meta.url))],
          },
        ],
        [
          'vite-plugin-checker',
          {
            vueTsc: true,
            eslint: {
              lintCommand: 'eslint -c ./eslint.config.js "./src*/**/*.{ts,js,mjs,cjs,vue}"',
              useFlatConfig: true,
            },
          },
          { server: false },
        ],
      ],
    },

     // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#devserver
    devServer: {
      port: 7000,
      // https: true,
      open: false, // do not auto-open browser window
      proxy: {
        '/api': {
          target: 'http://localhost:5467',
          changeOrigin: true,
        },
        '/auth': {
          target: 'http://localhost:5467',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:5467',
          changeOrigin: true,
        },
      },
    },

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#framework
    framework: {
      config: {},

      // iconSet: 'material-icons', // Quasar icon set
      // lang: 'en-US', // Quasar language pack

      // For special cases outside of where the auto-import strategy can have an impact
      // (like functional components as one of the examples),
      // you can manually specify Quasar components/directives to be available everywhere:
      //
      // components: [],
      // directives: [],

      // Quasar plugins
      plugins: ['Dark', 'Notify'],
    },

    // animations: 'all', // --- includes all animations
    // https://v2.quasar.dev/options/animations
    animations: [],

    // https://v2.quasar.dev/quasar-cli-vite/quasar-config-file#sourcefiles
    // sourceFiles: {
    //   rootComponent: 'src/App.vue',
    //   router: 'src/router/index',
    //   store: 'src/store/index',
    //   pwaRegisterServiceWorker: 'src-pwa/register-service-worker',
    //   pwaServiceWorker: 'src-pwa/custom-service-worker',
    //   pwaManifestFile: 'src-pwa/manifest.json',
    //   electronMain: 'src-electron/electron-main',
    //   electronPreload: 'src-electron/electron-preload'
    //   bexManifestFile: 'src-bex/manifest.json
    // },

    // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
    ssr: {
      prodPort: 3000, // The default port that the production server should use
      // (gets superseded if process.env.PORT is specified at runtime)

      middlewares: [
        'render', // keep this as last one
      ],

      // extendPackageJson (json) {},
      // extendSSRWebserverConf (esbuildConf) {},

      // manualStoreSerialization: true,
      // manualStoreSsrContextInjection: true,
      // manualStoreHydration: true,
      // manualPostHydrationTrigger: true,

      pwa: false,
      // pwaOfflineHtmlFilename: 'offline.html', // do NOT use index.html as name!

      // pwaExtendGenerateSWOptions (cfg) {},
      // pwaExtendInjectManifestOptions (cfg) {}
    },

    // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'GenerateSW', // 'GenerateSW' or 'InjectManifest'
      // swFilename: 'sw.js',
      // manifestFilename: 'manifest.json',
      // extendManifestJson (json) {},
      // useCredentialsForManifestTag: true,
      // injectPwaMetaTags: false,
      // extendPWACustomSWConf (esbuildConf) {},
      // extendGenerateSWOptions (cfg) {},
      // extendInjectManifestOptions (cfg) {}
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
    cordova: {
      // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
    capacitor: {
      hideSplashscreen: true,
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
    electron: {
      // extendElectronMainConf (esbuildConf) {},
      // extendElectronPreloadConf (esbuildConf) {},

      // extendPackageJson (json) {},

      // Electron preload scripts (if any) from /src-electron, WITHOUT file extension
      preloadScripts: ['electron-preload'],

      // specify the debugging port to use for the Electron app when running in development mode
      inspectPort: 5858,

      bundler: 'packager', // 'packager' or 'builder'

      packager: {
        // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
        // OS X / Mac App Store
        // appBundleId: '',
        // appCategoryType: '',
        // osxSign: '',
        // protocol: 'myapp://path',
        // Windows only
        // win32metadata: { ... }
      },

      builder: {
        // https://www.electron.build/configuration

        appId: 'openimgo',
      },
    },

    // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
    bex: {
      // extendBexScriptsConf (esbuildConf) {},
      // extendBexManifestJson (json) {},

      /**
       * The list of extra scripts (js/ts) not in your bex manifest that you want to
       * compile and use in your browser extension. Maybe dynamic use them?
       *
       * Each entry in the list should be a relative filename to /src-bex/
       *
       * @example [ 'my-script.ts', 'sub-folder/my-other-script.js' ]
       */
      extraScripts: [],
    },
  };
});
