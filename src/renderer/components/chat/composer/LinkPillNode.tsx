import { mergeAttributes, Node } from '@tiptap/core'
import type { NodeType, Node as PmNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { NodeViewWrapper, type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react'
import { splitLinks } from '@/lib/chat-links'
import { LINK_PILL_NODE } from '@/lib/composer/doc-to-prompt'
import { cn } from '@/lib/utils'
import { LinkChip } from '../LinkChip'

const AUTO_LINK_KEY = new PluginKey('linkPillAutoConvert')
const HISTORY_META = 'history$'

/**
 * Where a bare URL closed by whitespace sits in `doc`: each `[from, to, url]`
 * range is plain text the composer should show as a link pill. A URL still at
 * the end of its text (being typed) is left alone. Exported for tests.
 */
export function findClosedLinks(doc: PmNode): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = []
  const scan = (text: string, start: number): void => {
    let offset = 0
    for (const part of splitLinks(text)) {
      const length = part.kind === 'link' ? part.url.length : part.text.length
      if (part.kind === 'link' && /\s/.test(text.charAt(offset + length))) {
        out.push([start + offset, start + offset + length, part.url])
      }
      offset += length
    }
  }
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return true
    // Adjacent text nodes (split by marks) are one run of text.
    let run = ''
    let runStart = -1
    block.forEach((child, offset) => {
      const pos = blockPos + 1 + offset
      if (child.isText) {
        if (runStart < 0) runStart = pos
        run += child.text ?? ''
        return
      }
      if (runStart >= 0) scan(run, runStart)
      run = ''
      runStart = -1
    })
    if (runStart >= 0) scan(run, runStart)
    return false
  })
  return out
}

/**
 * Turns closed URLs into link pills after every doc change. A plugin rather
 * than an input rule: Tiptap input rules are skipped while the keyboard is
 * composing (IME, mobile autocorrect/prediction), which is how most phone and
 * many desktop keyboards type, so a typed URL would stay text. Composition is
 * left untouched and re-scanned when it ends; an undo of a conversion is
 * respected (not re-converted).
 */
function autoLinkPlugin(type: NodeType): Plugin {
  let currentView: EditorView | null = null
  return new Plugin({
    key: AUTO_LINK_KEY,
    view(view) {
      currentView = view
      return {
        destroy() {
          currentView = null
        }
      }
    },
    props: {
      handleDOMEvents: {
        compositionend: (view) => {
          setTimeout(() => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(AUTO_LINK_KEY, 'rescan'))
          }, 0)
          return false
        }
      }
    },
    appendTransaction(transactions, _oldState, state) {
      if (currentView?.composing) return null
      if (!transactions.some((tr) => tr.docChanged || tr.getMeta(AUTO_LINK_KEY))) return null
      if (transactions.some((tr) => tr.getMeta(HISTORY_META))) return null
      const ranges = findClosedLinks(state.doc)
      if (ranges.length === 0) return null
      const tr = state.tr
      for (const [from, to, url] of ranges.reverse()) {
        tr.replaceWith(from, to, type.create({ url }))
      }
      return tr
    }
  })
}

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
  addProseMirrorPlugins() {
    return [autoLinkPlugin(this.type)]
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
      className={cn('inline-flex align-middle leading-none', selected && 'ring-2 ring-primary/40')}
      data-link-pill="true"
      data-link-url={url}
    >
      <LinkChip url={url} variant="static" />
    </NodeViewWrapper>
  )
}
