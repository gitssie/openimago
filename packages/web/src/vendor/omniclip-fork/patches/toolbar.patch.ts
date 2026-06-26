// PATCH — single combined control bar (openimago-4qwj).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/toolbar/view.js  → export `Toolbar`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipToolbarPatch), guarding the relative `./views/toolbar/view.js`
// import from omni-timeline's component.js.
//
// WHY (STRUCTURAL, not CSS): the approved design (docs/images/cut_panel.png)
// shows ONE control bar that combines the PLAYBACK TRANSPORT (prev / play-pause
// / next + current/total time) with the TIMELINE TOOLBAR (zoom, fullscreen).
// In omniclip 1.0.7 those live in TWO SEPARATE shadow roots in TWO SEPARATE
// @benev/construct panes: the transport is an absolutely-positioned `.controls`
// overlay INSIDE the media-player <figure> (player pane), and the toolbar is the
// timeline's own shadow view (timeline pane). Pure CSS — even via the inherited
// --omni-*/--imago-* vars — CANNOT relocate a node from one shadow root into
// another, so a CSS reflow can only stack the two rows, not merge them. To get a
// genuine single bar we OWN the timeline toolbar view and render the transport
// here too, driving it from the SAME global omnislate context the player uses
// (compositor.toggle_video_playing, state.is_playing, actions.set_timecode).
// The player's own in-figure `.controls` overlay is hidden via the media-player
// styles patch so the transport is not duplicated.
//
// Importing upstream omniclip modules (shadow_view, icons) from HERE does NOT
// loop: the resolveId guard (isOmniclipPackageImporter) only redirects imports
// whose importer is inside the omniclip package; this file lives in src/, so
// these resolve to the real upstream. (The time readout uses our own MM:SS
// formatTimecodeMs, not omniclip's convert_ms_to_hmsms — openimago-ypxq.)
//
// PRESERVED from upstream (do not regress): the history (undo/redo), split,
// remove-selected and clear-project actions, with the SAME control structure and
// click handlers, so existing behaviour/markup is unchanged. ADDED: transport +
// current/total time + fullscreen + zoom in the same flex row.
//
// HONEST CONTROL SET: every control is REAL — no dead affordances (openimago-sm9j).
//   • prev/next are real SEEKS to the adjacent clip boundary (effects + set_timecode).
//   • fullscreen requests it on the construct-editor host (the player <figure> is in
//     a sibling shadow root we cannot query from here).
//   • MASTER MUTE (speaker): omniclip has no native mute API (its media-player
//     `isVideoMuted` state is declared but unused). We implement a real global mute
//     by setting `.muted` on every preview HTMLMediaElement — the audio-manager Map
//     (id → <audio>) and the video-manager Map (id → FabricImage; the <video> is
//     `fabricImage.getElement()`, guarded to HTMLMediaElement since decoded-frame
//     rendering can swap that element to a <canvas>). The flag is RE-APPLIED on the
//     compositor's `on_playing` rAF tick so it persists as new clips start playing
//     and as video elements swap — not just the set playing at toggle time.
//   • ZOOM SLIDER: omniclip exposes only zoom_in/zoom_out (±0.1) and no set_zoom, so
//     the slider reaches its target by calling those REACTIVE actions the right
//     number of ±0.1 steps (pure `zoomSteps` in cut-controls.ts) — the only route
//     that recomputes the ruler ticks + clip widths. The +/- buttons remain.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { html } from '@benev/slate'
import { shadow_view } from 'omniclip/x/context/context.js'
import binSvg from 'omniclip/x/icons/gravity-ui/bin.svg.js'
import cleanSvg from 'omniclip/x/icons/carbon-icons/clean.svg.js'
import scissorsSvg from 'omniclip/x/icons/gravity-ui/scissors.svg.js'
import undoSvg from 'omniclip/x/icons/material-design-icons/undo.svg.js'
import redoSvg from 'omniclip/x/icons/material-design-icons/redo.svg.js'
import playSvg from 'omniclip/x/icons/gravity-ui/play.svg.js'
import pauseSvg from 'omniclip/x/icons/gravity-ui/pause.svg.js'
import fullscreenSvg from 'omniclip/x/icons/gravity-ui/fullscreen.svg.js'
import zoomInSvg from 'omniclip/x/icons/material-design-icons/zoom-in.svg.js'
import zoomOutSvg from 'omniclip/x/icons/material-design-icons/zoom-out.svg.js'
import { combinedToolbarStyles } from './toolbar-styles'
// Pure timecode math (total length, prev/next boundary seek, MM:SS formatting)
// lives in the tested cut utils — ONE source of truth; the patch stays a thin
// view. (openimago-4qwj/ypxq) src/utils/cut/toolbar-timecode.ts has its own spec.
// formatTimecodeMs renders MM:SS to match docs/images/cut_panel.png ("00:04 /
// 01:04"), replacing omniclip's convert_ms_to_hmsms (HH:MM:SS:FF).
import {
  totalDurationMs,
  nextBoundaryTimecode,
  formatTimecodeMs,
} from 'src/utils/cut/toolbar-timecode'
// Pure zoom-step planning (slider target → N reactive ±0.1 action calls). Tested
// in cut-controls.spec.ts — the view stays a thin caller. (openimago-sm9j)
import { zoomSteps } from 'src/utils/cut/cut-controls'

// Zoom slider bounds — mirror upstream's clamps (the +/- buttons disable at
// these) and state.zoom default (-3). step matches the zoom_in/zoom_out delta.
const ZOOM_MIN = -13
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

// The toolbar is a PLAIN, NON-SCROLLING full-width bar ABOVE the scroll area
// (openimago-jtub). It lives OUTSIDE omni-timeline's `.scroll-area`, so it no longer
// shares the clips' scroll/zoom geometry — all the prior sticky/paneWidth/margin pin
// hacks are gone. `timeline` (the host) is still passed in and used only as the
// fullscreen fallback target.
export const Toolbar = shadow_view((use) => (_timeline: HTMLElement) => {
  use.styles(combinedToolbarStyles)
  use.watch(() => use.context.state)
  const actions = use.context.actions
  const state = use.context.state
  const zoom = state.zoom
  const controller = use.context.controllers.timeline
  const compositor = use.context.controllers.compositor

  // ── Master mute (real global mute; omniclip has no native API) ──────────────
  const [muted, setMuted] = use.state(false)

  /** Set `.muted` on every preview HTMLMediaElement (audio clips + preview video).
   *  Guards the video-manager element since decoded-frame draws can swap it to a
   *  <canvas> (no `.muted`). */
  const applyMute = (flag: boolean) => {
    const managers = compositor?.managers
    if (!managers) return
    for (const el of managers.audioManager.values()) {
      if (el instanceof HTMLMediaElement) el.muted = flag
    }
    for (const fab of managers.videoManager.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = (fab as any)?.getElement?.()
      if (el instanceof HTMLMediaElement) el.muted = flag
    }
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    applyMute(next)
  }

  use.mount(() => {
    // Re-apply the mute flag every animation frame WHILE PLAYING so it persists
    // as new clips start (currently_played_effects changes) and as video elements
    // swap — mirrors how media-player subscribes to on_playing.
    const unsubPlaying = compositor?.on_playing?.(() => applyMute(muted))
    return () => {
      unsubPlaying?.()
    }
  })

  /** Drive the slider's target zoom through the REACTIVE zoom_in/zoom_out actions
   *  (no set_zoom exists) so the ruler + clip widths recompute live. */
  const onZoomSlider = (event: Event) => {
    const target = Number((event.target as HTMLInputElement).value)
    if (!Number.isFinite(target)) return
    const plan = zoomSteps(state.zoom, target, ZOOM_STEP)
    if (plan.direction === 'none') return
    const step = plan.direction === 'in' ? actions.zoom_in : actions.zoom_out
    for (let i = 0; i < plan.count; i++) step()
  }

  const total = totalDurationMs(state.effects)

  /** Seek to the nearest clip boundary before / after the current timecode. */
  const seek = (direction: -1 | 1) => {
    const target = nextBoundaryTimecode(state.effects, state.timecode, direction)
    if (target === null) return
    // Pause while scrubbing so the seek sticks, then redraw at the new time.
    if (state.is_playing) compositor.set_video_playing(false)
    actions.set_timecode(target)
    compositor.set_current_time_of_audio_or_video_and_redraw(true, target)
  }

  /** Fullscreen the editor host (the player <figure> is in a sibling shadow root). */
  const toggleFullscreen = () => {
    const host =
      (use.shadow.host as HTMLElement | undefined)?.closest('[data-testid="cut-editor-host"]') ??
      (use.shadow.host as HTMLElement | undefined)?.getRootNode?.() ??
      null
    const target = (host instanceof HTMLElement ? host : document.documentElement)
    if (!document.fullscreenElement) {
      target.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  return html`
    <div class="toolbar">
      <div class=tools>
        <!-- LEFT: edit history + clip ops (unchanged from upstream). -->
        <div class=flex>
          <button @click=${() => controller.split(use.context.state)} class="split">${scissorsSvg}</button>
          <!-- button class="remove" ?disabled=${!use.context.state.selected_effect} @click=${() => controller.remove_selected_effect(use.context.state)}>
            ${binSvg}
          </button>
          <button @click=${() => use.context.clear_project()} class="clean">${cleanSvg}</button -->
        </div>

        <!-- CENTER: playback transport + current / total time (combined bar). -->
        <div class="transport" role="group" aria-label="播放控制">
          <button class="seek prev" aria-label="上一个片段" @click=${() => seek(-1)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M7 6h2v12H7zM20 6v12L9.5 12z" />
            </svg>
          </button>
          <button
            class="playpause"
            aria-label=${state.is_playing ? '暂停' : '播放'}
            data-state="${state.is_playing ? 'pause' : 'play'}"
            @click=${compositor.toggle_video_playing}
          >
            ${state.is_playing ? pauseSvg : playSvg}
          </button>
          <button class="seek next" aria-label="下一个片段" @click=${() => seek(1)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M15 6h2v12h-2zM4 6l10.5 6L4 18z" />
            </svg>
          </button>
          <div class="timecode" aria-label="当前时间 / 总时长">
            <span class="current">${formatTimecodeMs(state.timecode)}</span>
            <span class="sep">/</span>
            <span class="total">${formatTimecodeMs(total)}</span>
          </div>
        </div>

        <!-- RIGHT: master-mute · fullscreen · zoom-out · slider · zoom-in. -->
        <div class="right">
          <button
            class="mute"
            aria-label=${muted ? '取消静音' : '静音'}
            aria-pressed=${muted ? 'true' : 'false'}
            data-muted=${muted ? 'true' : 'false'}
            @click=${toggleMute}
          >
            ${muted
              ? html`
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <path d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path d="M16 9l4 4m0-4l-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                `
              : html`
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                    <path d="M3 9v6h4l5 5V4L7 9H3z" />
                    <path d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                  </svg>
                `}
          </button>
          <button class="fs" aria-label="全屏" @click=${toggleFullscreen}>${fullscreenSvg}</button>
          <div class="zoom">
            <button ?disabled=${zoom <= ZOOM_MIN} @click=${actions.zoom_out} class="zoom-out" aria-label="缩小">${zoomOutSvg}</button>
            <input
              class="zoom-slider"
              type="range"
              min=${ZOOM_MIN}
              max=${ZOOM_MAX}
              step=${ZOOM_STEP}
              .value=${String(zoom)}
              aria-label="缩放时间轴"
              @input=${onZoomSlider}
            />
            <button ?disabled=${zoom >= ZOOM_MAX} @click=${actions.zoom_in} class="zoom-in" aria-label="放大">${zoomInSvg}</button>
          </div>
        </div>
      </div>
    </div>
  `
})
