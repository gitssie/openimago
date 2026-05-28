/**
 * Strip markdown formatting characters from heading text
 * to produce a clean, readable label.
 */
export function cleanHeadingText(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .trim()
}

/**
 * Extract the first heading from a markdown string.
 *
 * Tries in order: HTML headings, ATX headings (#), setext headings, bold text.
 * Returns the cleaned heading text, or an empty string if none found.
 */
export function extractHeading(text: string): string {
  const markdown = text.replace(/\r\n?/g, '\n')

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
  if (html?.[1]) {
    const value = cleanHeadingText(html[1].replace(/<[^>]+>/g, ' '))
    if (value) return value
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m)
  if (atx?.[1]) {
    const value = cleanHeadingText(atx[1])
    if (value) return value
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m)
  if (setext?.[1]) {
    const value = cleanHeadingText(setext[1])
    if (value) return value
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m)
  if (strong?.[1]) {
    const value = cleanHeadingText(strong[1])
    if (value) return value
  }

  return ''
}
