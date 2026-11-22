import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExternalLinkConfirmHost } from '@/components/external-link/ExternalLinkConfirm'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { ChatMessage as ChatMessageType } from '@/stores/acp-store'

const { loadLinkPreview, peekLinkPreview } = vi.hoisted(() => ({
  loadLinkPreview: vi.fn(),
  peekLinkPreview: vi.fn()
}))

vi.mock('@/lib/link-preview-api', () => ({ loadLinkPreview, peekLinkPreview }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(() => Promise.resolve()) }))

import { ChatMessage } from './ChatMessage'
import { AgentProse } from './chat-agent-prose'
import { LinkChip } from './LinkChip'

const ZOOM = 'https://zoom.us/rec/share/abc'
const PREVIEW = {
  url: ZOOM,
  title: 'Zoom Recordings',
  siteName: 'Zoom',
  iconDataUri: 'data:image/png;base64,AA=='
}

beforeEach(() => {
  peekLinkPreview.mockReturnValue(undefined)
  loadLinkPreview.mockResolvedValue(PREVIEW)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('LinkChip', () => {
  it('shows the host while loading, then favicon + og title', async () => {
    let resolve: (v: typeof PREVIEW) => void = () => {}
    loadLinkPreview.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    render(<LinkChip url={ZOOM} />)
    const chip = screen.getByTestId('link-chip')
    expect(chip).toHaveTextContent('zoom.us')
    expect(chip).toHaveAttribute('title', ZOOM)
    await act(async () => resolve(PREVIEW))
    expect(chip).toHaveTextContent('Zoom Recordings')
    expect(screen.getByTestId('link-chip-icon')).toHaveAttribute('src', PREVIEW.iconDataUri)
  })

  it('falls back to the URL itself when there is no preview', async () => {
    loadLinkPreview.mockResolvedValueOnce(null)
    render(<LinkChip url={ZOOM} />)
    await waitFor(() => expect(screen.getByTestId('link-chip')).toHaveTextContent(ZOOM))
    expect(screen.queryByTestId('link-chip-icon')).toBeNull()
  })

  it('does not fetch while resolve is off (a streaming reply)', () => {
    render(<LinkChip url={ZOOM} resolve={false} />)
    expect(loadLinkPreview).not.toHaveBeenCalled()
    expect(screen.getByTestId('link-chip')).toHaveTextContent(ZOOM)
  })

  it('the link variant opens through the external-link confirm, not by navigation', async () => {
    render(
      <TooltipProvider>
        <LinkChip url={ZOOM} />
        <ExternalLinkConfirmHost />
      </TooltipProvider>
    )
    const chip = screen.getByTestId('link-chip')
    expect(chip.tagName).toBe('A')
    expect(chip).not.toHaveAttribute('target')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => {
      chip.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('chat surfaces embed bare links', () => {
  it('an agent reply shows a bare URL as a link chip once settled', async () => {
    render(
      <TooltipProvider>
        <AgentProse text={`Recording: ${ZOOM}`} streaming={false} reduced />
      </TooltipProvider>
    )
    await waitFor(() =>
      expect(screen.getByTestId('link-chip')).toHaveTextContent('Zoom Recordings')
    )
    expect(loadLinkPreview).toHaveBeenCalledWith(ZOOM)
  })

  it('an agent reply keeps a labelled markdown link as its label', () => {
    render(
      <TooltipProvider>
        <AgentProse text={`[the recording](${ZOOM})`} streaming={false} reduced />
      </TooltipProvider>
    )
    expect(screen.queryByTestId('link-chip')).toBeNull()
    expect(screen.getByText('the recording')).toBeInTheDocument()
  })

  it('an explicit link whose label looks like the URL keeps its label', () => {
    render(
      <TooltipProvider>
        <AgentProse
          text="[example.com](https://example.com) and [**zoom**](https://zoom.us)"
          streaming={false}
          reduced
        />
      </TooltipProvider>
    )
    expect(screen.queryByTestId('link-chip')).toBeNull()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText('zoom')).toBeInTheDocument()
  })

  it('a bare URL with non-ASCII characters still becomes a chip', async () => {
    render(
      <TooltipProvider>
        <AgentProse text="Menu: https://example.com/café ok" streaming={false} reduced />
      </TooltipProvider>
    )
    await waitFor(() => expect(screen.getByTestId('link-chip')).toBeInTheDocument())
    expect(loadLinkPreview).toHaveBeenCalledWith('https://example.com/café')
  })

  it('a user bubble shows a written URL as a link chip', async () => {
    const message: ChatMessageType = {
      id: 'u1',
      role: 'user',
      blocks: [{ type: 'text', text: `Rekaman Day 2:\n\n${ZOOM}\nPasscode: X` }],
      streaming: false,
      timestamp: 0
    }
    render(
      <TooltipProvider>
        <ChatMessage message={message} isLast />
      </TooltipProvider>
    )
    await waitFor(() =>
      expect(screen.getByTestId('link-chip')).toHaveTextContent('Zoom Recordings')
    )
    expect(screen.getByText(/Passcode: X/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('link-chip'))
  })
})
