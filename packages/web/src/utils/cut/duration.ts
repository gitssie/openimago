// Duration value object — the single guard for the LAST seconds boundary in the
// Cut link (openimago-23cr). After the integer-ms unification, the domain, disk
// (cut.json v2), and omniclip state all speak BARE INTEGER MS with zero
// conversion. The only place seconds still surface is the UI transition-duration
// input (a human types "0.5s"). This object converts at that single seam and
// nowhere else: internally it holds whole ms, so `.toJSON()` always serialises
// the bare integer ms the rest of the system expects.
//
// Do NOT thread Duration through the domain/mapper/service layers — they are
// plain `number` (ms) by design. Reach for it only where a seconds value enters
// or leaves the system through a human-facing control.

export class Duration {
  /** Whole milliseconds — the canonical internal representation. */
  private readonly _ms: number

  private constructor(ms: number) {
    this._ms = ms
  }

  /** Build from milliseconds, rounding to a whole ms (the unit is integer-ms). */
  static fromMs(ms: number): Duration {
    return new Duration(Math.round(ms))
  }

  /** Build from seconds (the UI transition-input boundary), rounding to whole ms. */
  static fromSeconds(seconds: number): Duration {
    return new Duration(Math.round(seconds * 1000))
  }

  /** Whole milliseconds. */
  get ms(): number {
    return this._ms
  }

  /** Seconds (ms / 1000) — for display in the seconds-facing UI control only. */
  get seconds(): number {
    return this._ms / 1000
  }

  /** Serialise to a bare integer ms — disk/wire/domain are all bare ms. */
  toJSON(): number {
    return this._ms
  }
}
