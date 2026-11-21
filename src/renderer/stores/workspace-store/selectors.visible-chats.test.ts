import { describe, expect, it } from 'vitest'
import type { PaneNode } from '@/types/workspace.types'
import { getVisibleAgentChatSessionIds } from './selectors'

const chat = (sessionId: string) => ({
  type: 'agent-chat' as const,
  id: `chat-${sessionId}`,
  sessionId
})

describe('getVisibleAgentChatSessionIds', () => {
  it('returns the chat each pane shows, not the chats in its other tabs', () => {
    const root: PaneNode = {
      type: 'split',
      id: 'split-1',
      direction: 'horizontal',
      sizes: [33, 33, 34],
      children: [
        {
          type: 'leaf',
          id: 'pane-1',
          tabs: [chat('s-hidden'), chat('s-left')],
          activeTabId: 'chat-s-left'
        },
        {
          type: 'leaf',
          id: 'pane-2',
          tabs: [chat('s-behind-terminal'), { type: 'terminal', id: 'term-1', terminalId: 't1' }],
          activeTabId: 'term-1'
        },
        { type: 'leaf', id: 'pane-3', tabs: [chat('s-right')], activeTabId: 'chat-s-right' }
      ]
    }
    expect(getVisibleAgentChatSessionIds({ root })).toEqual(['s-left', 's-right'])
  })
})
