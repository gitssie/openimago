// Pure logic for the ClipGenerateDialog's element @-mentions + inline chips
// (openimago-0f27). The composer lets an author @-mention a Bible ELEMENT
// (character/scene); each mention drops a human-readable token into the prompt
// text (which is itself sent to the video model) AND a chip is rendered for it.
//
// Framework-free so it is unit-tested independently of Vue/Quasar. The token is
// name-based and intentionally readable in the prompt, e.g. `Element_江_澄_ref_img`
// or `Element_Jiang_Cheng_ref_img`. Unicode letters are preserved so Chinese
// element names survive (the app's displayNames are typically Chinese).

/** Prefix + suffix that bracket an element-reference token in the prompt. */
const TOKEN_PREFIX = 'Element_'
const TOKEN_SUFFIX = '_ref_img'

/**
 * Global matcher for element tokens embedded in prompt text. Non-greedy middle so
 * the fixed `_ref_img` suffix anchors each match; `u` flag + \p{L}\p{N} keep
 * unicode (CJK) names intact.
 */
export const ELEMENT_MENTION_RE = /Element_([\p{L}\p{N}_]+?)_ref_img/gu

/** Turn an element display name into its token body (whitespace/punctuation → `_`). */
function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
}

/** Build the mention token for an element display name. Empty/blank → ''. */
export function elementRefToken(name: string): string {
  const body = sanitizeName(name)
  if (!body) return ''
  return `${TOKEN_PREFIX}${body}${TOKEN_SUFFIX}`
}

/** The display label for a token (its body with `_` shown as spaces). */
export function mentionLabel(token: string): string {
  const body = token.slice(TOKEN_PREFIX.length, token.length - TOKEN_SUFFIX.length)
  return body.replace(/_/g, ' ')
}

/** Ordered, de-duplicated list of element tokens present in the prompt text. */
export function extractElementMentions(prompt: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of prompt.matchAll(ELEMENT_MENTION_RE)) {
    const token = match[0]
    if (!seen.has(token)) {
      seen.add(token)
      out.push(token)
    }
  }
  return out
}

/** Append a token to the prompt (idempotent), separated by a single space. */
export function appendMention(prompt: string, token: string): string {
  if (!token) return prompt
  if (extractElementMentions(prompt).includes(token)) return prompt
  const base = prompt.replace(/\s+$/, '')
  return base ? `${base} ${token}` : token
}

/** Remove every occurrence of a token from the prompt and tidy the whitespace. */
export function removeMention(prompt: string, token: string): string {
  if (!token) return prompt
  return prompt
    .split(token)
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n +/g, '\n')
    .trim()
}
