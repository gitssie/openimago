// DOM (de)serialization for the ClipGenerateDialog's contenteditable prompt
// (openimago-212y). The composer's prompt is a `contenteditable` region in which
// @-mentioned Bible elements appear as INLINE chips (a mini avatar + name) embedded
// in the flowing text — like Notion/Slack mentions — instead of a separate chip bar.
//
// This module owns the two pure, framework-free transforms between the live DOM and
// the model — kept out of the .vue so they are unit-tested independently of Vue/Quasar
// (same convention as clip-element-mention.ts):
//   • serializePromptEl  — walk the contenteditable → { text, elementRefImgs }. Each
//     chip contributes its token to the text (so the video model still sees the
//     readable `Element_X_ref_img` token) and its reference image to a de-duped list.
//   • hydratePromptEl    — rebuild the contenteditable DOM from a prompt string that
//     may contain tokens (e.g. seeded from a prior generation): interleave text nodes
//     with reconstructed chips.
//   • createMentionChip  — build one chip <span> (contenteditable=false so it deletes
//     as a single atomic unit and never splits mid-edit).
//
// The cursor/selection insertion (getSelection/Range) lives in the component — it is
// browser-only and not meaningfully unit-testable; everything here is pure DOM.

import { ELEMENT_MENTION_RE, mentionLabel } from './clip-element-mention'

/** The class + dataset contract shared by createMentionChip (writer) and
 *  serializePromptEl (reader). One source of truth so they can't drift. */
export const MENTION_CHIP_CLASS = 'mention-chip'

export interface MentionChipData {
  /** The `Element_X_ref_img` token embedded in the prompt text for the model. */
  token: string
  /** Human-readable name shown in the chip (mentionLabel(token) by default). */
  label: string
  /** Reference-image src for the chip avatar; '' renders a text-only chip. */
  refImg: string
}

/** Build one inline mention chip: an atomic (contenteditable=false) span carrying the
 *  token + ref image in data-* so serialize can recover them, an optional avatar img,
 *  and the element name. */
export function createMentionChip(data: MentionChipData): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.className = MENTION_CHIP_CLASS
  chip.contentEditable = 'false'
  chip.dataset.token = data.token
  chip.dataset.refimg = data.refImg

  if (data.refImg) {
    const img = document.createElement('img')
    img.src = data.refImg
    img.alt = ''
    img.className = 'mention-chip__avatar'
    chip.appendChild(img)
  }

  const name = document.createElement('span')
  name.className = 'mention-chip__name'
  name.textContent = data.label
  chip.appendChild(name)

  return chip
}

/** True when `node` is a mention chip produced by createMentionChip. */
function isMentionChip(node: Node): node is HTMLElement {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).classList.contains(MENTION_CHIP_CLASS)
  )
}

/**
 * Serialize a contenteditable prompt root into the model text + the de-duplicated
 * reference images contributed by its chips. Text nodes contribute their text; each
 * chip contributes its token (space-padded so tokens stay word-separated even when a
 * chip was inserted flush against surrounding text) and its ref image.
 */
export function serializePromptEl(root: Node | null): { text: string; elementRefImgs: string[] } {
  const elementRefImgs: string[] = []
  let text = ''

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (isMentionChip(node)) {
      const token = node.dataset.token
      const refImg = node.dataset.refimg
      if (token) text += ` ${token} `
      if (refImg && !elementRefImgs.includes(refImg)) elementRefImgs.push(refImg)
      return
    }
    for (const child of Array.from(node.childNodes)) walk(child)
  }

  if (root) walk(root)
  // Collapse the runs of spaces the padding above can introduce, but preserve
  // newlines (the user's line breaks in the prompt are meaningful).
  const cleaned = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .trim()
  return { text: cleaned, elementRefImgs }
}

/**
 * Rebuild the prompt DOM inside `root` from a prompt string that may contain element
 * tokens: interleave plain text nodes with reconstructed chips. `resolveThumb(token)`
 * supplies each chip's avatar src (looked up from the current element list); return ''
 * for a text-only chip.
 *
 * NOTE: this walks matchAll with match indices rather than String.split(regex) —
 * ELEMENT_MENTION_RE has a capturing group, and split() would interleave the captured
 * bodies into the result array and misalign the text/token pairing.
 */
export function hydratePromptEl(
  root: HTMLElement,
  prompt: string,
  resolveThumb: (token: string) => string,
): void {
  root.replaceChildren()
  let last = 0
  for (const match of prompt.matchAll(ELEMENT_MENTION_RE)) {
    const start = match.index ?? 0
    const token = match[0]
    if (start > last) {
      root.appendChild(document.createTextNode(prompt.slice(last, start)))
    }
    root.appendChild(
      createMentionChip({ token, label: mentionLabel(token), refImg: resolveThumb(token) }),
    )
    last = start + token.length
  }
  if (last < prompt.length) {
    root.appendChild(document.createTextNode(prompt.slice(last)))
  }
}
