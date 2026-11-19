import { render } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useOverflowFade } from './use-overflow-fade'

function Label({ text }: { text: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useOverflowFade(ref, text)
  return (
    <span ref={ref} data-testid="label" className="fade-end-overflow">
      {text}
    </span>
  )
}

/** Rename unmounts the name, then mounts a new span with the same text. */
function RenameLabel({ editing, text }: { editing: boolean; text: string }): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useOverflowFade(ref, text, editing)
  if (editing) return <input data-testid="rename" defaultValue={text} />
  return (
    <span ref={ref} data-testid="label">
      {text}
    </span>
  )
}

function stubWidths(scrollWidth: number, clientWidth: number): () => void {
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
  const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  return () => {
    scroll.mockRestore()
    client.mockRestore()
  }
}

describe('useOverflowFade', () => {
  it('marks a label whose text is wider than its box', () => {
    const restore = stubWidths(240, 120)
    const { getByTestId } = render(<Label text="termul · fix/web-build-font-size-tokens" />)
    expect(getByTestId('label')).toHaveAttribute('data-overflowing')
    restore()
  })

  it('leaves a label that fits unmarked', () => {
    const restore = stubWidths(80, 80)
    const { getByTestId } = render(<Label text="termul · dev" />)
    expect(getByTestId('label')).not.toHaveAttribute('data-overflowing')
    restore()
  })

  it('rebinds after a remount that keeps the same text', () => {
    const restore = stubWidths(240, 120)
    const { getByTestId, rerender, queryByTestId } = render(
      <RenameLabel editing={false} text="termul · fix/web-build-font-size-tokens" />
    )
    expect(getByTestId('label')).toHaveAttribute('data-overflowing')
    rerender(<RenameLabel editing text="termul · fix/web-build-font-size-tokens" />)
    expect(queryByTestId('label')).not.toBeInTheDocument()
    rerender(<RenameLabel editing={false} text="termul · fix/web-build-font-size-tokens" />)
    expect(getByTestId('label')).toHaveAttribute('data-overflowing')
    restore()
  })

  it('leaves a short name unmarked after that remount', () => {
    const restore = stubWidths(80, 80)
    const { getByTestId, rerender } = render(<RenameLabel editing={false} text="termul · dev" />)
    rerender(<RenameLabel editing text="termul · dev" />)
    rerender(<RenameLabel editing={false} text="termul · dev" />)
    expect(getByTestId('label')).not.toHaveAttribute('data-overflowing')
    restore()
  })
})
