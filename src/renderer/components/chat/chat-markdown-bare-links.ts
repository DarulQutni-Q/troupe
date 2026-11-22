import { escapeHtmlAttribute } from './chat-markdown-file-links'

type MarkdownNode = {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
  position?: { start: { offset?: number }; end: { offset?: number } }
}

const HTTP_URL_RE = /^https?:\/\//i

/** Raw HTML for the bare-link element the sanitizer keeps (`data-url` only). */
export function termulLinkTag(url: string): string {
  const safe = escapeHtmlAttribute(url)
  return `<termul-link data-url="${safe}">${safe}</termul-link>`
}

/**
 * A link the agent wrote as a bare URL (a GFM autolink literal or `<url>`),
 * told apart from an explicit `[label](url)` by its source: an explicit link
 * starts with `[`. Parser provenance, not label text, so `[example.com](…)`
 * keeps its label.
 */
function isAutolink(node: MarkdownNode, source: string): boolean {
  if (node.type !== 'link' || !node.url || !HTTP_URL_RE.test(node.url)) return false
  const start = node.position?.start.offset
  if (start === undefined) return false
  return source.charAt(start) !== '['
}

function transform(node: MarkdownNode, source: string): void {
  const children = node.children
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (isAutolink(child, source)) {
      children[i] = { type: 'html', value: termulLinkTag(child.url ?? '') }
      continue
    }
    transform(child, source)
  }
}

/**
 * Remark plugin: each bare http(s) URL in an agent reply becomes a
 * `<termul-link>` element, rendered as the favicon + title link chip. Runs
 * after GFM so autolink literals already are `link` nodes.
 */
export function remarkBareLinkChips() {
  return (tree: MarkdownNode, file: { value?: unknown }): void => {
    transform(tree, String(file.value ?? ''))
  }
}
