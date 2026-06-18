// registerClipMenuItems — spike point 4 (openimago-uyd0).
//
// omniclip 1.0.7 has NO clip context menu. The registry core is the pure,
// unit-tested ClipMenuRegistry (src/_spike/omniclip/clip-menu-registry.ts); this
// file exposes a module-level singleton that the patched clip view
// (patches/effect.patch.ts) reads from. The host registers items
// (重新生成 / 添加到对话 / 手动编辑 / 删除); the patched view renders the
// `visibleItems(ctx)` on right-click and invokes onSelect with a ClipMenuContext.

import { ClipMenuRegistry } from 'src/_spike/omniclip/clip-menu-registry'

/** Singleton registry shared between the host and the patched clip view. */
export const clipMenuRegistry = new ClipMenuRegistry()

export const registerClipMenuItems = clipMenuRegistry.register
