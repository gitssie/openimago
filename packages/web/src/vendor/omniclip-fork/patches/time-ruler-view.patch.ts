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
//     against `.time-ruler`'s OWN box. `.time-ruler` is a flex child of the padded
//     `.timeline`, so its left edge is ALREADY at host.left + GUTTER_PX → ticks now
//     land at +GUTTER_PX, exactly over their clips. We add NO padding-left here
//     (that would double-count the shift). `.time-ruler` is a fixed-height,
//     viewport-width flex child (it does NOT scroll horizontally — only
//     `.timeline-relative` is wide and scrolls), so switching the positioning
//     ancestor changes ONLY the left origin by GUTTER_PX, with no scroll
//     double-count: the tick `offset`s already fold in `timeline.scrollLeft`.
//   • JS: subtract GUTTER_PX from the measured x so the indicator + seek map into
//     the same +GUTTER_PX frame as the ticks/clips.
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

  use.mount(() => {
    const set_time_codes = () => setTimeCodes(generate_time_codes(use.context.state.zoom))
    watch.track(
      () => use.context.state.zoom,
      (zoom: number) => setTimeCodes(generate_time_codes(zoom)),
    )
    timeline.addEventListener('scroll', set_time_codes)
    return () => timeline.removeEventListener('scroll', set_time_codes)
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

  function generate_time_codes(zoom: number) {
    const time_codes: Array<{ time: string; offset: number; kind: string }> = []
    const ms = 1000 / use.context.state.timebase
    for (
      let time_code = timeline.scrollLeft;
      time_code <= timeline.scrollLeft + timeline.clientWidth;
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

  return html`
    <div
      @pointerenter=${() => setIndicator(true)}
      @pointerleave=${() => setIndicator(false)}
      @pointermove=${(e: PointerEvent) =>
        setIndicatorX(e.clientX - timeline.getBoundingClientRect().left - GUTTER_PX + timeline.scrollLeft)}
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
  `
})
