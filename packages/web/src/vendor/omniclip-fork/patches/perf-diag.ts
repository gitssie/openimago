// TEMPORARY perf diagnostic accumulator (openimago-v2mm).
//
// Drag-move jank in the cut timeline survived two fixes (narrowing the child
// VideoEffect `use.watch`, guard-memoizing the filmstrip tiles), which points the
// hotspot at omniclip's PARENT re-render every mousemove (OmniTimeline watches the
// whole state; each `effect_drag.hovering` write re-runs `repeat(state.effects → …)`).
// Rather than keep guessing, this measures each patched render stage: it accumulates
// per-label elapsed ms + call count and, at most once per ~1000ms, logs a single
// `[perf-diag]` summary line and resets. DEV-only; zero cost in prod (the wrappers
// no-op when not DEV). REMOVE once the hotspot is identified.
//
// BROWSER-ONLY (this dir is excluded from typecheck/lint).

// import.meta.env.DEV is injected by Vite; treat anything else as prod (no-op).
const DEV: boolean =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true

interface Bucket {
  ms: number
  calls: number
}

const buckets = new Map<string, Bucket>()
const FLUSH_INTERVAL_MS = 1000
let lastFlush = 0
let flushScheduled = false

function bucketFor(label: string): Bucket {
  let b = buckets.get(label)
  if (!b) {
    b = { ms: 0, calls: 0 }
    buckets.set(label, b)
  }
  return b
}

/** Emit the accumulated summary and reset, at most once per FLUSH_INTERVAL_MS. */
function maybeFlush(): void {
  const now = performance.now()
  if (now - lastFlush < FLUSH_INTERVAL_MS) {
    // Schedule a trailing flush so the final partial window is not lost when the
    // drag stops and no more wrapped renders fire to drive the time check.
    if (!flushScheduled) {
      flushScheduled = true
      setTimeout(() => {
        flushScheduled = false
        flushNow()
      }, FLUSH_INTERVAL_MS)
    }
    return
  }
  flushNow()
}

function flushNow(): void {
  lastFlush = performance.now()
  if (buckets.size === 0) return
  const summary: Record<string, { ms: number; calls: number }> = {}
  for (const [label, b] of buckets) {
    // Round ms to 2dp so the line stays readable.
    summary[label] = { ms: Math.round(b.ms * 100) / 100, calls: b.calls }
  }
  buckets.clear()
  // eslint-disable-next-line no-console
  console.log('[perf-diag]', summary)
}

/**
 * Time `fn`, accumulate its elapsed ms + a call into `label`'s bucket, and return
 * fn's result unchanged. No-op passthrough in prod. Safe for any return type
 * (including lit TemplateResult / arrays of them) — the value is returned as-is.
 */
export function perfWrap<T>(label: string, fn: () => T): T {
  if (!DEV) return fn()
  const start = performance.now()
  try {
    return fn()
  } finally {
    const b = bucketFor(label)
    b.ms += performance.now() - start
    b.calls += 1
    maybeFlush()
  }
}

/**
 * Count an event (no timing) into `label`'s call counter — e.g. how many times the
 * filmstrip tile subtree actually REBUILT (guard cache-miss) vs was reused. DEV-only.
 */
export function perfCount(label: string): void {
  if (!DEV) return
  const b = bucketFor(label)
  b.calls += 1
  maybeFlush()
}
