import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react'
import { isHttpUrl, trimUrlCandidate } from '@/lib/chat-links'
import { LINK_PILL_NODE } from '@/lib/composer/doc-to-prompt'
import { cn } from '@/lib/utils'
import { LinkChip } from '../LinkChip'

/**
 * A URL typed into the composer and closed by whitespace: `…https://x.dev ` →
 * the URL becomes a link pill and the whitespace is kept after it. Exported
 * for tests.
 */
export const LINK_INPUT_RE = /(?:^|\s)(https?:\/\/\S+)(\s)$/

/**
 * Inline atomic Tiptap node for a written link, shown as favicon + page title
 * (the shared `<LinkChip>`, same as the timeline bubble). Unlike the other
 * pills it has no sentinel token: the display string carries the raw URL, so
 * the prompt the agent receives and the saved draft are byte-identical to the
 * typed text, and `draftFromTokens` turns bare URLs back into pills on load.
 *
 * `parseHTML` returns `[]` like the other pills: clipboard HTML never creates
 * a pill; pasted `text/plain` URLs are converted by
 * `ChatComposerEditor.handlePaste` via `draftFromTokens`.
 */
export const LinkPill = Node.create({
  name: LINK_PILL_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-link-url') ?? ''
      }
    }
  },
  parseHTML() {
    return []
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-link-pill': '', 'data-link-url': node.attrs.url })
    ]
  },
  renderText({ node }) {
    return String(node.attrs.url ?? '')
  },
  addInputRules() {
    return [
      new InputRule({
        find: LINK_INPUT_RE,
        handler: ({ state, range, match }) => {
          const raw = match[1] ?? ''
          const space = match[2] ?? ' '
          const url = trimUrlCandidate(raw)
          if (!isHttpUrl(url) || url.length <= 'https://'.length) return null
          // `range.to` is the caret before the typed whitespace; the URL ends
          // there. A pill inside the range (its text is not the URL) refuses.
          const urlFrom = range.to - raw.length
          if (urlFrom < 0 || state.doc.textBetween(urlFrom, range.to, '\n', '￼') !== raw) {
            return null
          }
          const { schema, tr } = state
          const tail = raw.slice(url.length) + space
          tr.replaceWith(urlFrom, range.to, [
            schema.nodes[LINK_PILL_NODE].create({ url }),
            schema.text(tail)
          ])
        }
      })
    ]
  },
  addNodeView() {
    return ReactNodeViewRenderer(LinkPillNodeView)
  }
})

function LinkPillNodeView({ node, selected }: ReactNodeViewProps): React.JSX.Element {
  const url = String((node.attrs as { url?: string }).url ?? '')
  return (
    <NodeViewWrapper
      as="span"
      className={cn('inline-flex align-bottom leading-none', selected && 'ring-2 ring-primary/40')}
      data-link-pill="true"
      data-link-url={url}
    >
      <LinkChip url={url} variant="static" />
    </NodeViewWrapper>
  )
}
