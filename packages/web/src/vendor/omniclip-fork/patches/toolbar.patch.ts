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
// HONEST CONTROL SET: omniclip exposes no audio mute/volume capability and no
// native prev/next, so we do NOT render a dead volume control. prev/next are real
// SEEKS to the adjacent clip boundary (derived from the effects + set_timecode).
// fullscreen requests it on the construct-editor host (the player <figure> is in a
// sibling shadow root we cannot query from here).
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

export const Toolbar = shadow_view((use) => (timeline: HTMLElement) => {
  use.styles(combinedToolbarStyles)
  use.watch(() => use.context.state)
  const actions = use.context.actions
  const state = use.context.state
  const zoom = state.zoom
  const controller = use.context.controllers.timeline
  const compositor = use.context.controllers.compositor

  use.mount(() => {
    const observer = new ResizeObserver(() => use.rerender())
    observer.observe(timeline)
    return () => observer.disconnect()
  })

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
      <div style="width: ${timeline.offsetWidth}px;" class=tools>
        <!-- LEFT: edit history + clip ops (unchanged from upstream). -->
        <div class=flex>
          <div class=history>
            <button ?data-past=${use.context.history.past.length !== 0} @click=${() => use.context.undo(use.context.state)}>${undoSvg}</button>
            <button ?data-future=${use.context.history.future.length !== 0} @click=${() => use.context.redo(use.context.state)}>${redoSvg}</button>
          </div>
          <button @click=${() => controller.split(use.context.state)} class="split">${scissorsSvg}</button>
          <button class="remove" ?disabled=${!use.context.state.selected_effect} @click=${() => controller.remove_selected_effect(use.context.state)}>
            ${binSvg}
          </button>
          <button @click=${() => use.context.clear_project()} class="clean">${cleanSvg}</button>
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

        <!-- RIGHT: fullscreen + zoom (zoom unchanged from upstream). -->
        <div class="right">
          <button class="fs" aria-label="全屏" @click=${toggleFullscreen}>${fullscreenSvg}</button>
          <div class="zoom">
            <button ?disabled=${zoom <= -13} @click=${actions.zoom_out} class="zoom-out" aria-label="缩小">${zoomOutSvg}</button>
            <button ?disabled=${zoom >= 2} @click=${actions.zoom_in} class="zoom-in" aria-label="放大">${zoomInSvg}</button>
          </div>
        </div>
      </div>
    </div>
  `
})
