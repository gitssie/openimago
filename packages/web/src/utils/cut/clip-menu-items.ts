// Build the Cut editor's per-clip context-menu items (openimago-e0n3).
//
// Pure factory: given a set of host callbacks, returns the 4 ClipMenuItem
// objects the fork's registerClipMenuItems hook renders. Centralises the
// labels, the orphan-gating (重新生成/手动编辑/添加到对话 require a live
// sourceShotId; 删除 always available — it removes the CLIP, not the shot), and
// the action routing. Unit-tested with spy callbacks.

import type { ClipMenuContext, ClipMenuItem } from './fork-contract'

export interface ClipMenuCallbacks {
  /** 重新生成 — regenerate the source shot's media (api.generateShot). */
  onRegenerate: (sourceShotId: string) => void
  /** 手动编辑 — edit the source shot's description (api.updateShot). */
  onManualEdit: (sourceShotId: string) => void
  /** 删除 — delete the CLIP via the cut deleteClip endpoint (NOT the shot). */
  onDeleteClip: (effectId: string) => void
  /** 添加到对话 — attach the clip's media as a chat reference + switch tab. */
  onAddToChat: (sourceShotId: string) => void
}

/** True when the clip still points at a live source shot. */
function hasSource(ctx: ClipMenuContext): boolean {
  return ctx.sourceShotId !== undefined
}

export function buildClipMenuItems(cb: ClipMenuCallbacks): ClipMenuItem[] {
  return [
    {
      id: 'add-to-chat',
      label: '添加到对话',
      icon: 'chat',
      isEnabled: hasSource,
      onSelect: (ctx) => {
        if (ctx.sourceShotId) cb.onAddToChat(ctx.sourceShotId)
      },
    },
    {
      id: 'regenerate',
      label: '重新生成',
      icon: 'enhance-wave',
      isEnabled: hasSource,
      onSelect: (ctx) => {
        if (ctx.sourceShotId) cb.onRegenerate(ctx.sourceShotId)
      },
    },
    {
      id: 'manual-edit',
      label: '手动编辑',
      icon: 'edit',
      isEnabled: hasSource,
      onSelect: (ctx) => {
        if (ctx.sourceShotId) cb.onManualEdit(ctx.sourceShotId)
      },
    },
    {
      // Always available — even for orphan clips — and removes the clip only.
      id: 'delete-clip',
      label: '删除',
      icon: 'trash',
      onSelect: (ctx) => cb.onDeleteClip(ctx.effectId),
    },
  ]
}
