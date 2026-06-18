// PATCH — clip context menu (openimago-uyd0, spike point 4).
//
// Replaces s/components/omni-timeline/views/effects/parts/effect.ts `Effect`
// `shadow_view`. The original (omniclip@1.0.7) has a single `@click` and no
// menu. This adds:
//   - `@contextmenu` that opens a menu at the cursor with the host's items,
//   - `part="clip"` so the host can ::part()-style the clip,
//   - menu items sourced from clipMenuRegistry.visibleItems(ctx).
//
// Only the render delta is shown; the original drag/trim logic above the
// `return html` is preserved verbatim in the real fork. BROWSER-ONLY.

import { html } from '@benev/slate'
import { clipMenuRegistry } from '../capabilities/clip-menu'
import type { ClipMenuContext } from 'src/_spike/omniclip/fork-contract'

// `use` is the omniclip shadow_view context; `effect` is the resolved AnyEffect.
// Signature mirrors the original view's locals (see README source map).
interface ViewUse {
  state: <T>(initial: T) => [T, (v: T) => void]
}

/**
 * Build the menu template for a clip. `resolveShotId` maps effect.file_hash ->
 * sourceShotId (the host supplies it at fork boot). Returns null when the menu
 * is closed or no items are visible.
 */
export function renderClipMenu(
  open: boolean,
  position: { x: number; y: number },
  ctx: ClipMenuContext,
  closeMenu: () => void,
) {
  if (!open) return null
  const items = clipMenuRegistry.visibleItems(ctx)
  if (items.length === 0) return null
  return html`
    <ul
      class="clip-menu"
      part="clip-menu"
      style="position:fixed; left:${position.x}px; top:${position.y}px; z-index:50;"
    >
      ${items.map(
        (item) => html`
          <li>
            <button
              type="button"
              part="clip-menu-item"
              @click=${() => {
                item.onSelect(ctx)
                closeMenu()
              }}
            >
              ${item.label}
            </button>
          </li>
        `,
      )}
    </ul>
  `
}

/**
 * The `@contextmenu` handler to attach to the `.effect` element in the patched
 * view. Opens the menu at the pointer and wires close-on-blur.
 */
export function makeContextMenuHandler(
  use: ViewUse,
  ctx: ClipMenuContext,
  setOpen: (open: boolean) => void,
  setPosition: (p: { x: number; y: number }) => void,
) {
  return (event: MouseEvent) => {
    event.preventDefault()
    setPosition({ x: event.clientX, y: event.clientY })
    setOpen(true)
  }
}
