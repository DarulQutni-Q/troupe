/**
 * Bare-URL detection for agent chat: the composer turns a written link into a
 * link pill, and the user bubble shows it as favicon + title. Only `http(s)`
 * URLs count; trailing sentence punctuation and an unbalanced closing bracket
 * stay outside the link (`see https://x.dev/a).` → `https://x.dev/a`).
 */

export type LinkSegment = { kind: 'text'; text: string } | { kind: 'link'; url: string }

// Stops at whitespace, quotes, angle brackets and the private-use sentinel
// range the composer tokens use (U+E000–U+E00F).
const URL_RE = /\bhttps?:\/\/[^\s<>"'`\uE000-\uE00F]+/gi
const TRAILING_PUNCT = /[.,;:!?…]+$/

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function count(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n += 1
  return n
}

/** Trim trailing punctuation and unbalanced closers off a matched URL. */
export function trimUrlCandidate(raw: string): string {
  let url = raw
  for (;;) {
    const before = url
    url = url.replace(TRAILING_PUNCT, '')
    const last = url.at(-1)
    const open = last ? PAIRS[last] : undefined
    if (open && last && count(url, last) > count(url, open)) url = url.slice(0, -1)
    if (url === before) return url
  }
}

/** A string that parses as an `http(s)` URL with a host. */
export function isHttpUrl(text: string): boolean {
  try {
    const url = new URL(text)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

/** Split plain text into text and bare-URL segments, in order. */
export function splitLinks(text: string): LinkSegment[] {
  const out: LinkSegment[] = []
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0
    const url = trimUrlCandidate(match[0])
    // `https://` alone (or with only punctuation) is not a link.
    if (!isHttpUrl(url) || url.length <= 'https://'.length) continue
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
    out.push({ kind: 'link', url })
    last = start + url.length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** Whether `text` contains at least one bare `http(s)` URL. */
export function hasLink(text: string): boolean {
  return splitLinks(text).some((segment) => segment.kind === 'link')
}

/** The hostname without a leading `www.`, the chip label before a title loads. */
export function linkHostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
