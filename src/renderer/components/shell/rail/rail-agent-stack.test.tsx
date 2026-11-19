import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RailAgentStack, RailChatAgents, stackAgentIds } from './rail-agent-stack'
import { RailDensityProvider } from './rail-density'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `agent-${i}`)

/** The glyph wrappers inside the 14px box, in paint order. */
function glyphs(container: HTMLElement): HTMLElement[] {
  const box = container.querySelector('[data-rail-agent-stack] > span') as HTMLElement
  return Array.from(box.querySelectorAll<HTMLElement>('span.absolute.flex'))
}

describe('stackAgentIds', () => {
  it('collapses consecutive repeats and keeps the order (first = original)', () => {
    expect(stackAgentIds(['a', 'a', 'b', 'a'])).toEqual(['a', 'b', 'a'])
    expect(stackAgentIds(undefined)).toEqual([])
  })
})

describe('RailAgentStack', () => {
  it.each([
    [2, 9, ['0,0', '5,5']],
    [3, 8, ['0,0', '6,0', '3,6']],
    [4, 7, ['0,0', '7,0', '0,7', '7,7']],
    [5, 7, ['0,0', '7,0', '0,7', '7,7', '3.5,3.5']]
  ])('fits %i agents in the 14px box as %ipx glyphs', (count, size, slots) => {
    const { container } = render(<RailAgentStack ids={ids(count)} />)
    expect(
      screen.getByRole('img', { name: `Conversation agents, ${count} total` })
    ).toBeInTheDocument()
    const placed = glyphs(container)
    expect(placed).toHaveLength(count)
    expect(placed.map((g) => `${parseFloat(g.style.left)},${parseFloat(g.style.top)}`)).toEqual(
      slots
    )
    for (const glyph of placed) expect(glyph.style.width).toBe(`${size}px`)
    // Every glyph in front of another gets a cutout; the first does not.
    expect(container.querySelectorAll('span.absolute.rounded-full')).toHaveLength(count - 1)
    expect(container.textContent).not.toMatch(/\+\d/)
  })

  it('keeps "+N" off the collapsed Rail, where the 30px square has no room', () => {
    const { container } = render(
      <RailDensityProvider density="collapsed">
        <RailAgentStack ids={ids(7)} />
      </RailDensityProvider>
    )
    expect(screen.getByRole('img', { name: 'Conversation agents, 7 total' })).toBeInTheDocument()
    expect(glyphs(container)).toHaveLength(4)
    expect(screen.queryByText('+3')).not.toBeInTheDocument()
  })

  it('shows the first four and "+N" for six or more agents', () => {
    const { container } = render(<RailAgentStack ids={ids(7)} />)
    expect(screen.getByRole('img', { name: 'Conversation agents, 7 total' })).toBeInTheDocument()
    expect(glyphs(container)).toHaveLength(4)
    expect(screen.getByText('+3')).toBeInTheDocument()
  })

  it('cuts each front glyph out of the row surface at rest, on hover and when open', () => {
    const { container } = render(<RailAgentStack ids={ids(2)} />)
    expect(container.querySelector('span.absolute.rounded-full')).toHaveClass(
      'bg-background',
      'group-hover/rail-chat:bg-row-hover-solid',
      'group-data-[state=open]/rail-chat:bg-row-hover-solid',
      '[[data-open]_&]:!bg-[var(--keycap-fill)]',
      '[[data-rail-surface]_&]:[[data-open]_&]:!bg-[var(--rail-keycap-fill)]'
    )
  })
})

describe('RailChatAgents', () => {
  it('draws one glyph for a single-agent chat and the stack for two or more', () => {
    const { container, rerender } = render(<RailChatAgents agentConfigId="solo" />)
    expect(container.querySelector('[data-rail-agent-stack]')).toBeNull()
    rerender(<RailChatAgents agents={['a', 'b']} />)
    expect(container.querySelector('[data-rail-agent-stack="2"]')).toBeInTheDocument()
    rerender(<RailChatAgents agents={['a', 'a']} />)
    expect(container.querySelector('[data-rail-agent-stack]')).toBeNull()
  })
})
