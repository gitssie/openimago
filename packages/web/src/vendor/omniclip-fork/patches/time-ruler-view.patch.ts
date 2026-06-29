// PATCH — bring the TIME-RULER into the gutter-shifted clip frame (openimago-scml).
//
// Drop-in replacement for omniclip@1.0.7's
//   x/components/omni-timeline/views/time-ruler/view.js  → export `TimeRuler`
// swapped in via a scoped Vite resolveId redirect in quasar.config.ts
// (omniclipTimeRulerViewPatch), guarding the relative
// `./views/time-ruler/view.js` import from omni-timeline's component.js.
//
// WHY (regression from the gutter fix): omni-timeline-styles.patch.ts left-pads
// the `.timeline` flex column by GUTTER_PX, shifting the clips/effects (absolute
// children of `.timeline-relative`) right by GUTTER_PX. The ruler ticks did NOT
// follow, so they sat GUTTER_PX left of their clips and clicking the ruler seeked
// GUTTER_PX early. Two upstream facts cause it:
//   1. Tick `.time` divs are `position:absolute` but `.time-ruler` is
//      `display:flex` with NO position, so they resolve against the nearest
//      POSITIONED ancestor — the omni-timeline `:host{position:relative}`, which is
//      OUTSIDE the padded `.timeline`. → ticks render at host.left + offset, with
//      no +GUTTER_PX.
//   2. The hover indicator + click-to-seek measure x from
//      `timeline.getBoundingClientRect().left` where `timeline = use.element = the
//      host` → also GUTTER_PX too far left.
//
// FIX (keyed off the shared GUTTER_PX — never hardcode):
//   • STYLES: make `.time-ruler{position:relative}` so the absolute ticks resolve
//     against `.time-ruler`'s OWN box. The ruler now lives inside `.scroll-area`,
//     which carries the gutter padding-left:GUTTER_PX (openimago-jtub), so the
//     ruler box already starts at +GUTTER_PX → ticks land over their clips. We add
//     NO padding-left here (that would double-count the shift). The tick `offset`s
//     already fold in the scroll-area's scrollLeft.
//   • JS: subtract GUTTER_PX from the measured x so the indicator + seek map into
//     the same +GUTTER_PX frame as the ticks/clips.
//
// SCROLL SOURCE (openimago-jtub): the host no longer scrolls — only `.scroll-area`
// does. So all scroll reads (scrollLeft/clientWidth, the scroll listener) AND the
// indicator/seek bounds come from `scrollEl = host.shadowRoot.querySelector('.scroll-area')`,
// NOT the host.
//
// Everything else (timecode generation, zoom buckets, indicator visuals) is COPIED
// VERBATIM from upstream — this is a faithful drop-in, only the two x-frame sites
// and the one position rule change.
//
// Importing the upstream styles from HERE does NOT loop: the resolveId guard only
// redirects imports whose importer is inside the omniclip package; this file lives
// in src/, so it resolves to real upstream.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

import { html, watch, css } from '@benev/slate'
import { styles as upstreamStyles } from 'omniclip/x/components/omni-timeline/views/time-ruler/styles.js'
import { shadow_view } from 'omniclip/x/context/context.js'
import { GUTTER_PX } from './timeline-gutter'
import { perfWrap } from './perf-diag' // TEMP perf diagnostic (openimago-v2mm)

// Upstream `.time` ticks are position:absolute but `.time-ruler` is unpositioned,
// so they fall back to `:host` (outside the padded `.timeline`). Position the
// ruler itself so ticks resolve against its already-gutter-shifted box. No
// padding-left — the parent `.timeline` padding already moved this box +GUTTER_PX.
const gutterAlign = css`
  .time-ruler {
    position: relative;
  }
`

const styles = css`
  ${upstreamStyles}
  ${gutterAlign}
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTimeline = any

export const TimeRuler = shadow_view((use) => (timeline: AnyTimeline) => {
  use.styles(styles)
  const [timeCodes, setTimeCodes] = use.state([] as Array<{ time: string; offset: number; kind: string }>)
  const [_, setPrevTimecode, getPrevTimecode] = use.state(null as number | null)
  const [_p, setPrev, getPrev] = use.state(null as number | null)
  const [indicatorX, setIndicatorX] = use.state(0)
  const [indicator, setIndicator] = use.state(false)

  // openimago-jtub: only `.scroll-area` scrolls now (NOT the host), so ALL scroll
  // geometry (scrollLeft/clientWidth, the scroll listener, the seek/indicator
  // bounds) must come from `.scroll-area`. Resolve it from the RULER's OWN element
  // (`use.element`) which lives inside `.scroll-area` in the same shadow root —
  // `closest('.scroll-area')` is reliable once the ruler is in the DOM. The old
  // resolution read `timeline.shadowRoot.querySelector('.scroll-area')` ONCE at
  // mount, but the host's `.scroll-area` is not yet committed when the child ruler
  // mounts, so it returned null → fell back to the (non-scrolling) host → the
  // scroll listener bound to an element that never fires → the ruler stayed frozen
  // on the initial 0–visible window and never extended across the timeline
  // (openimago ruler regression). Resolving lazily every call fixes both the
  // listener target and the scrollLeft/clientWidth reads.
  const scrollEl = (): AnyTimeline => {
    const self = use.element as { closest?(s: string): AnyTimeline } | null
    const fromSelf = self?.closest?.('.scroll-area')
    if (fromSelf) return fromSelf
    const fromHost = (
      timeline as { shadowRoot?: { querySelector(s: string): AnyTimeline } }
    ).shadowRoot?.querySelector('.scroll-area')
    return fromHost ?? timeline
  }

  use.mount(() => {
    const set_time_codes = () => setTimeCodes(generate_time_codes(use.context.state.zoom))
    watch.track(
      () => use.context.state.zoom,
      (zoom: number) => setTimeCodes(generate_time_codes(zoom)),
    )
    // The scroll-area may not exist in the DOM yet when this child view mounts, so
    // bind the listener as soon as it resolves (retry across a few frames), and
    // regenerate once on attach so the first window is correct. Bounded so the
    // loop can never spin forever if `.scroll-area` is somehow never present.
    const MAX_ATTACH_FRAMES = 120 // ~2s at 60fps
    let scrollTarget: AnyTimeline = null
    let rafId = 0
    let frames = 0
    let cancelled = false
    const attach = () => {
      if (cancelled) return
      const el = scrollEl()
      const isScrollArea =
        (el as { classList?: { contains(s: string): boolean } }).classList?.contains?.('scroll-area') ?? false
      if (isScrollArea) {
        scrollTarget = el
        el.addEventListener('scroll', set_time_codes)
        set_time_codes()
        return
      }
      if (frames++ >= MAX_ATTACH_FRAMES) return
      rafId = requestAnimationFrame(attach)
    }
    attach()
    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (scrollTarget) scrollTarget.removeEventListener('scroll', set_time_codes)
    }
  })

  function convert_ms_to_timecode(milliseconds: number) {
    let seconds = Math.floor(milliseconds / 1000)
    let minutes = Math.floor(seconds / 60)
    seconds = seconds % 60
    const zoom_rounded = round_to_two_decimal_places(use.context.state.zoom)
    if (zoom_rounded <= -9) {
      return `${minutes}min`
    } else {
      return `${Math.floor((milliseconds / 1000) * 1000) / 1000}s`
    }
  }

  function round_to_two_decimal_places(zoom: number) {
    return Math.round(zoom * 100) / 100
  }

  function round_timecode_to(timecode: number, zoom: number, ms: number) {
    const number_of_dots = Math.ceil(-zoom) / 2 // one dot between; larger divisor → more dots
    const closestTimeCode =
      (Math.round((timecode / (ms * Math.ceil(-zoom))) * number_of_dots) / number_of_dots) *
      (ms * Math.ceil(-zoom))
    const offset = closestTimeCode / Math.pow(2, -zoom)
    if (closestTimeCode !== getPrevTimecode()) {
      setPrevTimecode(closestTimeCode)
      return { time: convert_ms_to_timecode(closestTimeCode), offset, kind: 'normal' }
    } else {
      const closestTimeCode2 =
        (Math.round((timecode / (ms * Math.ceil(-zoom))) * Math.ceil(-zoom)) / Math.ceil(-zoom)) *
        (ms * Math.ceil(-zoom))
      const offset2 = closestTimeCode2 / Math.pow(2, -zoom)
      if (closestTimeCode2 !== getPrev() && closestTimeCode2 !== getPrevTimecode()) {
        setPrev(closestTimeCode2)
        return { time: convert_ms_to_timecode(closestTimeCode2), offset: offset2, kind: 'dot' }
      }
    }
  }

  // TEMP perf diagnostic (openimago-v2mm): `time-ruler-gen` times the tick-generation
  // loop (the heavy make_increments-style scan). It runs on zoom change + scroll (not
  // every drag frame), so during a pure clip-drag its `calls` should stay ~0 — if it
  // spikes, scroll-driven regeneration is part of the jank.
  function generate_time_codes(zoom: number) {
    return perfWrap('time-ruler-gen', () => generate_time_codes_impl(zoom))
  }

  function generate_time_codes_impl(zoom: number) {
    const time_codes: Array<{ time: string; offset: number; kind: string }> = []
    const ms = 1000 / use.context.state.timebase
    const el = scrollEl()
    for (
      let time_code = el.scrollLeft;
      time_code <= el.scrollLeft + el.clientWidth;
      time_code += 5
    ) {
      const exact_time_code = time_code * Math.pow(2, -zoom)
      const zoom_rounded = round_to_two_decimal_places(zoom)
      if (zoom_rounded < 0) {
        if (zoom_rounded <= -13) {
          const timecode = round_timecode_to(exact_time_code, zoom, 60000 * 5)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -12 && zoom_rounded > -13) {
          const timecode = round_timecode_to(exact_time_code, zoom, 60000 * 4)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -11 && zoom_rounded > -12) {
          const timecode = round_timecode_to(exact_time_code, zoom, 60000 * 3)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -10 && zoom_rounded > -11) {
          const timecode = round_timecode_to(exact_time_code, zoom, 60000 * 2)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -9 && zoom_rounded > -10) {
          const timecode = round_timecode_to(exact_time_code, zoom, 60000)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -8 && zoom_rounded > -9) {
          const timecode = round_timecode_to(exact_time_code, zoom, 10000)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -7 && zoom_rounded > -8) {
          const timecode = round_timecode_to(exact_time_code, zoom, 5000)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -6 && zoom_rounded > -7) {
          const timecode = round_timecode_to(exact_time_code, zoom, 2000)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded <= -4 && zoom_rounded > -6) {
          const timecode = round_timecode_to(exact_time_code, zoom, 1000)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded < -2 && zoom_rounded > -4) {
          const timecode = round_timecode_to(exact_time_code, zoom, 500)
          if (timecode) time_codes.push(timecode)
        }
        if (zoom_rounded >= -2) {
          const timecode = round_timecode_to(exact_time_code, zoom, 100)
          if (timecode) time_codes.push(timecode)
        }
      }
      if (zoom_rounded >= 0) {
        const closestTimeCode = Math.round(exact_time_code / ms) * ms
        const offset = closestTimeCode / Math.pow(2, -zoom)
        if (closestTimeCode !== getPrevTimecode()) {
          time_codes.push({ time: convert_ms_to_timecode(closestTimeCode), offset, kind: 'normal' })
          setPrevTimecode(closestTimeCode)
        }
      }
    }
    return time_codes
  }

  const translate_to_timecode_and_set = (x: number) => {
    const zoom = use.context.state.zoom
    const milliseconds = x * Math.pow(2, -zoom)
    use.context.actions.set_timecode(milliseconds)
  }

  // TEMP perf diagnostic (openimago-v2mm): `time-ruler` times the ruler's render build
  // (mapping the cached timeCodes to tick divs). Nested INSIDE `timeline-component`
  // (the parent invokes TimeRuler in its render), so its ms is a SUBSET of that label.
  return perfWrap(
    'time-ruler',
    () => html`
    <div
      @pointerenter=${() => setIndicator(true)}
      @pointerleave=${() => setIndicator(false)}
      @pointermove=${(e: PointerEvent) => {
        const el = scrollEl()
        setIndicatorX(e.clientX - el.getBoundingClientRect().left - GUTTER_PX + el.scrollLeft)
      }}
      @click=${() => translate_to_timecode_and_set(indicatorX)}
      class="time-ruler"
    >
      <div
        style="transform: translateX(${indicatorX}px); display: ${indicator ? 'block' : 'none'};"
        class="indicator"
      ></div>
      ${timeCodes.map(
        ({ time, offset, kind }) => html`
          <div class="time ${kind}" style="transform: translateX(${offset}px)">
            <div class="content">${kind === 'normal' ? time : null}</div>
          </div>
        `,
      )}
    </div>
  `,
  )
})
