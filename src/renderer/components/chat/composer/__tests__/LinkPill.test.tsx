import { act, render, waitFor } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { docToDisplayText, LINK_PILL_NODE } from '@/lib/composer/doc-to-prompt'
import { draftFromTokens } from '@/lib/composer/draft-from-tokens'
import { fileToken } from '@/lib/skill-tokens'
import { ChatComposerEditor } from '../ChatComposerEditor'
import { getComposerValue, setComposerValue } from '../chat-composer-test-helpers'
import { FilePill } from '../FilePillNode'
import { LinkPill } from '../LinkPillNode'

vi.mock('@/lib/link-preview-api', () => ({
  loadLinkPreview: vi.fn(() =>
    Promise.resolve({
      url: 'https://zoom.us/rec/share/abc',
      title: 'Zoom Recordings',
      siteName: null,
      iconDataUri: null
    })
  ),
  peekLinkPreview: vi.fn(() => undefined)
}))

const ZOOM = 'https://zoom.us/rec/share/abc'
const schema = getSchema([StarterKit, FilePill, LinkPill])
const roundTrip = (value: string): string =>
  docToDisplayText(schema.nodeFromJSON(draftFromTokens(value)))

function editorHandle(): Editor {
  const el = document.querySelector('[data-composer-editor="true"]') as
    | (HTMLElement & { __composerEditor?: Editor | null })
    | null
  const editor = el?.__composerEditor
  if (!editor) throw new Error('editor not mounted')
  return editor
}

function pasteEvent(text: string): Event {
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'clipboardData', {
    value: { types: ['text/plain'], getData: (t: string) => (t === 'text/plain' ? text : '') },
    configurable: true
  })
  return ev
}

function typeText(editor: Editor, text: string): void {
  const { view } = editor
  const { from, to } = view.state.selection
  const handled = view.someProp('handleTextInput', (f) => f(view, from, to, text))
  if (!handled) view.dispatch(view.state.tr.insertText(text, from, to))
}

afterEach(() => {
  for (const el of Array.from(document.querySelectorAll('[data-composer-editor="true"]'))) {
    const editor = (el as HTMLElement & { __composerEditor?: Editor | null }).__composerEditor
    if (editor && !editor.isDestroyed) editor.destroy()
  }
})

describe('link pill model', () => {
  it('parses bare URLs in a draft into link pills', () => {
    expect(draftFromTokens(`see ${ZOOM} now`)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ' },
            { type: LINK_PILL_NODE, attrs: { url: ZOOM } },
            { type: 'text', text: ' now' }
          ]
        }
      ]
    })
  })

  it('serializes back to the exact typed text (the wire is unchanged)', () => {
    for (const value of [
      `Rekaman Day 2:\n\n${ZOOM}\nPasscode: WNE?FC+1`,
      `(${ZOOM}).`,
      `${fileToken('a.ts', '/p/a.ts')} vs https://x.dev/a?b=1#c`
    ]) {
      expect(roundTrip(value)).toBe(value)
    }
  })
})

describe('link pill in the composer', () => {
  function mount(onValueChange = vi.fn()) {
    render(<ChatComposerEditor value="" onValueChange={onValueChange} ariaLabel="composer" />)
  }

  it('turns a typed URL into a pill when whitespace follows it', async () => {
    mount()
    await waitFor(() => expect(editorHandle()).toBeTruthy())
    const editor = editorHandle()
    act(() => {
      setComposerValue(`look ${ZOOM}`)
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      typeText(editor, ' ')
    })
    await waitFor(() => expect(document.querySelector('[data-link-pill="true"]')).toBeTruthy())
    expect(document.querySelector('[data-link-pill="true"]')?.getAttribute('data-link-url')).toBe(
      ZOOM
    )
    expect(getComposerValue()).toBe(`look ${ZOOM} `)
    await waitFor(() =>
      expect(document.querySelector('[data-testid="link-chip"]')?.textContent).toContain(
        'Zoom Recordings'
      )
    )
  })

  it('keeps trailing punctuation as text after the pill', async () => {
    mount()
    await waitFor(() => expect(editorHandle()).toBeTruthy())
    const editor = editorHandle()
    act(() => {
      setComposerValue(`${ZOOM}.`)
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      typeText(editor, ' ')
    })
    await waitFor(() => expect(document.querySelector('[data-link-pill="true"]')).toBeTruthy())
    expect(getComposerValue()).toBe(`${ZOOM}. `)
  })

  it('a pasted plain-text URL lands inline as a pill', async () => {
    mount()
    await waitFor(() => expect(editorHandle()).toBeTruthy())
    const editor = editorHandle()
    act(() => {
      setComposerValue('Rekaman: ')
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    })
    act(() => {
      editor.view.dom.dispatchEvent(pasteEvent(ZOOM))
    })
    await waitFor(() => expect(document.querySelector('[data-link-pill="true"]')).toBeTruthy())
    expect(getComposerValue()).toBe(`Rekaman: ${ZOOM}`)
    expect(editor.state.doc.childCount).toBe(1)
  })
})
