import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { buildProjectWorkspace, useWorkspaceStore } from '@/stores/workspace-store'
import { startResyncPromotion } from './index'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))

const chat = (sessionId: string) => ({
  type: 'agent-chat' as const,
  id: `chat-${sessionId}`,
  sessionId
})

describe('startResyncPromotion', () => {
  const promoted: string[] = []
  let stop: () => void = () => undefined

  beforeEach(() => {
    promoted.length = 0
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useWorkspaceStore.setState(
      buildProjectWorkspace({
        type: 'leaf',
        id: 'pane-1',
        activeTabId: 'chat-s-shown',
        tabs: [chat('s-shown'), chat('s-behind'), chat('s-other')]
      })
    )
    stop = startResyncPromotion({ prioritizeResubscribe: (sid) => promoted.push(sid) })
  })

  afterEach(() => stop())

  it('promotes a chat tab when it comes on screen, not the one it replaced', () => {
    useWorkspaceStore.getState().setActiveTab('pane-1', 'chat-s-behind')
    expect(promoted).toEqual(['s-behind'])
  })

  it('promotes the quick chat when it opens', () => {
    useQuickChatStore.getState().openChat('s-quick')
    expect(promoted).toEqual(['s-quick'])
  })

  it('stops promoting after the unsubscribe', () => {
    stop()
    useWorkspaceStore.getState().setActiveTab('pane-1', 'chat-s-other')
    expect(promoted).toEqual([])
  })
})
