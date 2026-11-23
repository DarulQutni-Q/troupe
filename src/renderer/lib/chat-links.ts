/**
 * Bare-URL detection for agent chat: a sent user bubble shows a written link
 * as favicon + title (the composer keeps plain text). Only `http(s)`
 * URLs count; trailing sentence punctuation and an unbalanced closing bracket
 * stay outside the link (`see https://x.dev/a).` → `https://x.dev/a`).
 */

export type LinkSegment = { kind: 'text'; text: string } | { kind: 'link'; url: string }

// Stops at whitespace, quotes, angle brackets and the private-use sentinel
// range the message tokens use (U+E000–U+E00F).
const URL_RE = /\bhttps?:\/\/[^\s<>"'`\uE000-\uE00F]+/gi
const TRAILING_PUNCT = '.,;:!?…'

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

/**
 * Trim trailing punctuation and unbalanced closers off a matched URL. One
 * pass from the end with bracket counts taken once, so a URL followed by
 * thousands of `)` stays linear.
 */
export function trimUrlCandidate(raw: string): string {
  const counts: Record<string, number> = {}
  for (const c of raw) if (c in PAIRS || '([{'.includes(c)) counts[c] = (counts[c] ?? 0) + 1
  let end = raw.length
  while (end > 0) {
    const last = raw[end - 1]
    if (TRAILING_PUNCT.includes(last)) {
      end -= 1
      continue
    }
    const open = PAIRS[last]
    if (open && (counts[last] ?? 0) > (counts[open] ?? 0)) {
      counts[last] -= 1
      end -= 1
      continue
    }
    break
  }
  return raw.slice(0, end)
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

/** The hostname without a leading `www.`, the chip label before a title loads. */
export function linkHostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
