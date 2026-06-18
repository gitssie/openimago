<!--
  THROWAWAY SPIKE — openimago-2re7 (ADR 0007 GO/NO-GO gate).
  Delete the whole `_spike/omniclip/` dir + its route once the gate is decided.

  This page is the EMBED probe (spike point 1). It does NOT npm-install omniclip
  (67 MB, ships a 12 MB sample mp4, raw .ts + COOP/COEP service-worker reqs) — it
  documents the exact embedding shape verified against omniclip@1.0.7 source, and
  shows the URL->File ingestion the mapper requires (spike point 2).

  The mounting approach below is the one that WOULD work for a real adoption:
   1. `omniclip`'s `x/index.js` runs `register_to_dom(...)` as an import side-effect,
      defining <construct-editor>, <omni-timeline>, <omni-media>, <omni-text>.
      It also constructs a GLOBAL singleton `omnislate.context` (OmniContext).
   2. You render the registered custom element in a Vue template (Vue passes
      unknown tags straight through to the DOM — configure
      `isCustomElement` in quasar.config so vue-tsc/compiler don't warn).
   3. You drive state via `omnislate.context.actions` and read it via
      `omnislate.context.state` (see the mapper).
-->
<template>
  <div class="spike">
    <h1>omniclip embed spike — openimago-2re7</h1>
    <p class="spike__note">
      Throwaway. See <code>_spike/omniclip/README.md</code> for the GO/NO-GO verdict.
    </p>

    <!--
      With omniclip installed + booted, the editor mounts as a single custom
      element. Kept commented so the spike builds without the dependency:

      <construct-editor></construct-editor>
      // or just the timeline panel:
      <omni-timeline></omni-timeline>
    -->
    <section class="spike__panel" aria-label="omniclip mount placeholder">
      <p>&lt;construct-editor&gt; would mount here (see comments).</p>
    </section>

    <button class="spike__btn" type="button" @click="runIngestProbe">
      Probe URL → File ingestion (point 2)
    </button>
    <pre class="spike__log">{{ log }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const log = ref('idle')

/**
 * Spike point 2 — feed OUR media (a remote Shot Run URL) into omniclip.
 *
 * omniclip has NO "load from URL" API. Media is keyed by content-hash and
 * lives in IndexedDB as a `File`; its controller imports only via an
 * <input type="file"> change event (`media.import_file(input)`), then derives
 * frames/duration/thumbnail with ffprobe-wasm/WebCodecs CLIENT-SIDE.
 *
 * So driving its timeline from our data means: fetch URL -> Blob -> File ->
 * hand to the media controller -> wait for on_media_change -> THEN build the
 * effect via actions.add_video_effect (see cut-omniclip.mapper.ts).
 *
 * This probe demonstrates the fetch->File half (the part that does not need
 * omniclip installed). It is illustrative, not wired to a real CDN here.
 */
async function runIngestProbe(): Promise<void> {
  log.value = 'fetching sample…'
  try {
    // In production this is the completed Run artifact URL for a Shot.
    const sampleUrl =
      'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
    const res = await fetch(sampleUrl)
    if (!res.ok) {
      log.value = `fetch failed: HTTP ${res.status} (expected if offline — the point stands)`
      return
    }
    const blob = await res.blob()
    const file = new File([blob], 'shot.mp4', { type: blob.type })
    // At this point production code would call:
    //   omnislate.context.controllers.media.import_file(<input carrying `file`>)
    // omniclip only accepts an HTMLInputElement, so a real integration must
    // synthesize a DataTransfer-backed input or FORK import_file to take a File.
    log.value =
      `fetched ${file.size} bytes as File("${file.name}"). ` +
      `Next: feed to media.import_file (omniclip accepts only <input>, ` +
      `so this needs a synthetic input or a small fork).`
  } catch (err) {
    log.value = `error: ${(err as Error).message}`
  }
}
</script>

<style scoped>
.spike {
  padding: 24px;
  color: #ddd;
  font-family: monospace;
  background: #0a0a0f;
  min-height: 100vh;
}
.spike__note {
  color: #888;
}
.spike__panel {
  border: 1px dashed #444;
  border-radius: 8px;
  padding: 40px;
  margin: 16px 0;
  text-align: center;
  color: #666;
}
.spike__btn {
  background: #1a1a24;
  color: #0ff;
  border: 1px solid #0ff5;
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
}
.spike__log {
  margin-top: 12px;
  white-space: pre-wrap;
  color: #9f9;
}
</style>
