# ADR 0007: Adopt omniclip as the Timeline (Cut) Editor, with cut.json Canonical

**Status:** Accepted — **fork required** (confirmed by spike openimago-2re7)
**Date:** 2026-06-18
**Relates to:** ADR 0006 (Episode Cut as a separate story file), ADR 0004 (Story state as JSON files)

> **Spike outcome (openimago-2re7, omniclip@1.0.7 source).** Ownership model A is
> validated — state read/write maps to/from `EpisodeCut` (round-trip tests green).
> But clean npm-as-library adoption is **NO-GO**; three points each require forking:
> (2) **feed media** — no load-from-URL; media is `<input type=file>` → content-hash →
> IndexedDB `File`, so our Shot URLs must `fetch → Blob → File → import`; (4) **clip menu**
> — no context-menu / extension API (inline lit buttons in shadow DOM); (5) **theming** —
> shadow DOM + hard-coded hex, no CSS custom properties, `--imago-*` can't pierce. Plus:
> embed requires **app-wide COOP/COEP headers** (SharedArrayBuffer + WebCodecs + ffmpeg.wasm),
> a **global singleton** editor, no SSR, and **no transition primitive** in 1.0.7.
> **Team decision: accept owning a fork and proceed with route 1.** Fallback to route 2
> (VideoContext + custom Vue timeline UI) remains if the fork burden proves untenable.

## Context

The 时间线 tab becomes an NLE **Cut** editor (ADR 0006): a multi-track timeline
where the user trims, **splits**, drags/reorders clips, sets transitions and a BGM
bed, and previews the rough cut. Each video clip is a Shot's generated media
(`sourceShotId`), and per-clip menu items bridge back to the generation layer
("重新生成 / 手动编辑 / 添加到对话").

Building this from scratch (timeline UI + frame-accurate playback engine + split/
trim/transition logic + export) is a large effort. We surveyed the open-source field
(June 2026):

- **omniclip** (omni-media/omniclip) — MIT, ~1.4k★, actively developed. TypeScript
  **Web Components** (`<omni-timeline>`, `<omni-media>`, …) over `@benev/slate` state.
  Embeddable via npm + custom-element registration → framework-agnostic, runs inside
  our Vue 3 / Quasar app. Has timeline, multi-track, trim, split, transitions, audio,
  and WebCodecs-based playback + render to 4K.
- **vue-video-editor** (openvideo) — matches our Vue stack but is a standalone Nuxt
  app with ~3 commits; too immature and app-shaped to adopt.
- React options (OpenCut, Twick, clip-js) — wrong framework.
- **IMG.LY CE.SDK** — turnkey and Vue-supported, but commercial/paid.

The constraint that dominates: **ADR 0004 makes the filesystem the canonical source
of truth and requires the AI agent to be able to read/write story state.** Any editor
we adopt must not capture the Cut state in a format the agent can't author.

## Decision

**Adopt (and if needed fork) omniclip as the timeline editor UI + playback/export
engine. Our own `EpisodeCut` schema (ADR 0006, `story/cuts/ep_NNN.cut.json`) remains
the canonical Cut state; omniclip is a replaceable view layer hydrated from it.**

### Ownership: cut.json is canonical, omniclip is a view (the "A" model)

- On open: read `cut.json` → **map** our `EpisodeCut` (clips with `sourceShotId` /
  `inPoint` / `outPoint` / `order`, transitions, bgm) into omniclip's in-editor state,
  resolving each clip's media from the source Shot's completed Run.
- On edit/save: **map omniclip's timeline state back** into our `EpisodeCut` shape and
  persist via the ADR 0005 optimistic-concurrency write endpoints.
- `cut.json` never stores omniclip's private project blob. The agent can still read and
  author the Cut, and omniclip can be swapped for another editor without a data migration.

We accept that only omniclip capabilities **expressible in our schema** are usable;
features beyond the schema (e.g. arbitrary effect graphs) are out of scope until the
schema is deliberately extended.

### Consequences for earlier exploration

omniclip provides playback (WebCodecs) and render itself, so the previously considered
preview engine (BBC VideoContext) and a separate export path are **not needed** for the
adopt route. Export uses omniclip's renderer.

## Consequences

### Positive
- Large head-start: timeline UI, split/trim/transition, frame-accurate playback, and
  export come from a maintained MIT project instead of bespoke code.
- Domain integrity preserved — `cut.json` stays in our language; agent can still author
  the Cut; ADR 0004/0006 hold.
- omniclip is isolated behind a mapping layer, so it is replaceable.

### Negative
- A bidirectional **mapping layer** (EpisodeCut ↔ omniclip state) must be built and kept
  in sync with omniclip upgrades.
- Custom clip-menu items ("重新生成 / 添加到对话") must be injected into omniclip's
  Web-Component context menu — feasibility depends on its extension points; may require a
  fork.
- Theming: omniclip's styles must be overridden to fit the dark-neon design system; no
  documented theming API (Web Components / shadow DOM may constrain CSS reach).
- New runtime dependency on omniclip + `@benev/slate` and the Web Components model inside
  a Quasar/Vue app.

### Neutral
- A short spike is expected to confirm (1) feeding Shot media into omniclip, (2) mapping
  its state to/from `cut.json`, (3) extending its clip menu. If omniclip resists these,
  the fallback is the assemble route (VideoContext engine + custom Vue timeline UI).

## Alternatives Considered
- **Assemble from parts** (VideoContext/Etro engine + custom Vue timeline UI) — clean fit
  to domain + theme, full control of clip menu, but the most UI code. Held as the fallback
  if omniclip fights integration.
- **vue-video-editor (openvideo)** — rejected: too immature (~3 commits), standalone app.
- **IMG.LY CE.SDK** — rejected for now: commercial/paid; revisit if omniclip and the
  assemble route both prove too costly.
- **Store omniclip project blob in cut.json (the "B" model)** — rejected: makes cut.json
  omniclip's private format, breaking ADR 0004's "agent can read/write story state" and
  hard-binding us to omniclip.

## References
- `docs/adr/0006-episode-cut-separate-story-file.md` — EpisodeCut schema this maps to
- `docs/adr/0004-story-state-json-schema.md` — filesystem-canonical, agent-authorable
- `docs/adr/0005-ui-story-writes-optimistic-concurrency.md` — write endpoints reused
- omniclip: https://github.com/omni-media/omniclip
