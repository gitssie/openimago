// registerClipMenuItems + runtime context menu (openimago-uyd0 → wired 1mcb).
//
// omniclip 1.0.7 has NO clip context menu and the Effect view is a sealed
// shadow_view we can't cleanly override without source-vendoring its whole lit
// component chain. Instead we install a document-level `contextmenu` listener
// (capture) that detects a right-click on a `.effect` element (found via
// composedPath so it pierces the shadow DOM), resolves the clicked effect, and
// renders the host's registered items as a light-DOM overlay at the cursor.
// (openimago-1mcb)
//
// The registry core is the pure, unit-tested ClipMenuRegistry. Orphan-gating
// (isEnabled) needs sourceShotId, which the host supplies via a resolver set at
// hydration (effectId === CutClip.id, so the panel maps it to the shot).
//
// BROWSER-ONLY.

import { ClipMenuRegistry } from 'src/utils/cut/clip-menu-registry'
import { omnislate } from '../upstream/context/context'
import type { ClipMenuContext } from 'src/utils/cut/fork-contract'

export const clipMenuRegistry = new ClipMenuRegistry()
export const registerClipMenuItems = clipMenuRegistry.register

// effectId → sourceShotId resolver (host-supplied; orphan when undefined).
let sourceShotResolver: (effectId: string) => string | undefined = () => undefined
export function setClipContextResolver(fn: (effectId: string) => string | undefined): void {
  sourceShotResolver = fn
}

let menuEl: HTMLUListElement | null = null
let installed = false

function closeMenu(): void {
  menuEl?.remove()
  menuEl = null
}

/** Resolve the effect id for a right-clicked `.effect` element. */
function effectIdAt(path: EventTarget[]): string | undefined {
  // The .effect span doesn't carry its id, but clicking selects it; omniclip
  // tracks the selected effect on state. We select on contextmenu (below) then
  // read it back. Guard for absence.
  const hasEffect = path.some(
    (t) => t instanceof HTMLElement && t.classList?.contains('effect'),
  )
  if (!hasEffect) return undefined
  const selected = (omnislate.context.state as { selected_effect?: { id?: string } })
    .selected_effect
  return selected?.id
}

function renderMenu(ctx: ClipMenuContext, x: number, y: number): void {
  closeMenu()
  const items = clipMenuRegistry.visibleItems(ctx)
  if (items.length === 0) return

  const ul = document.createElement('ul')
  ul.className = 'omni-clip-menu'
  ul.setAttribute('part', 'clip-menu')
  Object.assign(ul.style, {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    zIndex: '9999',
    margin: '0',
    padding: '4px',
    listStyle: 'none',
    background: 'var(--omni-clip-fill, #1a1a24)',
    border: '1px solid var(--omni-accent, #00f0ff)',
    borderRadius: '6px',
  } satisfies Partial<CSSStyleDeclaration>)

  for (const item of items) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('part', 'clip-menu-item')
    btn.textContent = item.label
    Object.assign(btn.style, {
      display: 'block',
      width: '100%',
      padding: '6px 14px',
      background: 'transparent',
      border: 'none',
      color: 'var(--omni-text, #ddd)',
      textAlign: 'left',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>)
    btn.addEventListener('click', () => {
      item.onSelect(ctx)
      closeMenu()
    })
    li.appendChild(btn)
    ul.appendChild(li)
  }

  document.body.appendChild(ul)
  menuEl = ul
}

/** Install the document-level contextmenu listener once, at fork boot. */
export function installClipContextMenu(): void {
  if (installed) return
  installed = true

  document.addEventListener(
    'contextmenu',
    (event: MouseEvent) => {
      const path = event.composedPath()
      const hasEffect = path.some(
        (t) => t instanceof HTMLElement && t.classList?.contains('effect'),
      )
      if (!hasEffect) {
        closeMenu()
        return
      }
      event.preventDefault()
      const effectId = effectIdAt(path)
      if (!effectId) return
      const ctx: ClipMenuContext = {
        effectId,
        sourceShotId: sourceShotResolver(effectId),
      }
      renderMenu(ctx, event.clientX, event.clientY)
    },
    true,
  )

  // Dismiss on outside click / Escape.
  document.addEventListener('click', (e) => {
    if (menuEl && e.target instanceof Node && !menuEl.contains(e.target)) closeMenu()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu()
  })
}
