// Clip-menu registry — pure, headless-testable core of the fork's
// registerClipMenuItems capability (openimago-uyd0). No omniclip/DOM imports, so
// it is unit-tested in this repo; the vendored fork re-exports it and the
// browser-only patched clip view consumes `visibleItems`.

import type {
  ClipMenuContext,
  ClipMenuItem,
  RegisterClipMenuItems,
} from './fork-contract'

export class ClipMenuRegistry {
  #items: ClipMenuItem[] = []
  #listeners = new Set<() => void>()

  register: RegisterClipMenuItems = (newItems) => {
    this.#items.push(...newItems)
    this.#notify()
    return () => {
      for (const item of newItems) {
        const i = this.#items.indexOf(item)
        if (i >= 0) this.#items.splice(i, 1)
      }
      this.#notify()
    }
  }

  /** Items enabled for a given clip (the patched view calls this on open). */
  visibleItems(ctx: ClipMenuContext): ClipMenuItem[] {
    return this.#items.filter((item) => (item.isEnabled ? item.isEnabled(ctx) : true))
  }

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #notify(): void {
    for (const l of this.#listeners) l()
  }
}
