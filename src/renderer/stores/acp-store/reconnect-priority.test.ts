import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mobileShell } = vi.hoisted(() => ({ mobileShell: { current: false } }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: vi.fn(() => true),
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/chat-activity-sync', () => ({ startChatActivitySync: () => () => {} }))
vi.mock('@/hooks/use-chat-read-marker', () => ({ useChatReadMarker: () => {} }))
vi.mock('@/hooks/use-mobile-web-shell', () => ({ useMobileWebShell: () => mobileShell.current }))

import { useShellUnreadTracker } from '@/hooks/use-shell-unread-tracker'
import { _setAcpTransportForTests, type AcpTransport } from '@/lib/acp-transport'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { PaneNode } from '@/types/workspace.types'
import { initAcpEventListeners, useAcpStore } from './index'
import { FRESH } from './testkit'

const chatLeaf = (id: string, sessionId: string): PaneNode => ({
  type: 'leaf',
  id,
  tabs: [{ type: 'agent-chat', id: `chat-${sessionId}`, sessionId }],
  activeTabId: `chat-${sessionId}`
})

const twoChatPanes: PaneNode = {
  type: 'split',
  id: 'split-1',
  direction: 'horizontal',
  sizes: [50, 50],
  children: [chatLeaf('pane-left', 's-left'), chatLeaf('pane-right', 's-right')]
}

describe('reconnect priority sessions', () => {
  let prioritySessions: () => string[] = () => []
  let teardown: () => void = () => {}

  beforeEach(() => {
    mobileShell.current = false
    useAcpStore.setState(FRESH)
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useWorkspaceStore.setState({
      root: twoChatPanes,
      activePaneId: 'pane-left',
      fullscreenPaneId: null
    })
    _setAcpTransportForTests({
      setReconnectListener: vi.fn(),
      setReconnectPriorityProvider: (provider: () => string[]) => {
        prioritySessions = provider
      },
      setRecoveryHandler: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
      dispose: vi.fn()
    } as unknown as AcpTransport)
    teardown = initAcpEventListeners()
  })

  afterEach(() => teardown())

  it('lists every pane chat on screen in a split', () => {
    renderHook(() => useShellUnreadTracker())
    expect(prioritySessions()).toEqual(['s-left', 's-right'])
  })

  it('lists only the fullscreen pane chat, not the panes it hides', () => {
    useWorkspaceStore.setState({ fullscreenPaneId: 'pane-right' })
    renderHook(() => useShellUnreadTracker())
    expect(prioritySessions()).toEqual(['s-right'])
  })

  it('lists only the active pane chat on the mobile shell, which shows one pane', () => {
    mobileShell.current = true
    useWorkspaceStore.setState({ activePaneId: 'pane-right' })
    renderHook(() => useShellUnreadTracker())
    expect(prioritySessions()).toEqual(['s-right'])
  })

  it('lists the open quick chat and the chats waiting on the user, not the panes it covers', () => {
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 's-quick' } })
    useAcpStore.setState({
      pendingPermissions: {
        'perm-1': {
          requestId: 'perm-1',
          agentId: 'agent-1',
          sessionId: 's-waiting',
          options: [],
          toolCall: null
        }
      },
      promptCommandStates: {
        's-resend': {
          commandId: 'cmd-1',
          kind: 'send_prompt',
          entityKey: 's-resend',
          phase: 'pending-reconcile',
          outcomeUnknown: false,
          attempts: 1
        }
      }
    })
    renderHook(() => useShellUnreadTracker())
    expect(prioritySessions()).toEqual(['s-quick', 's-waiting', 's-resend'])
  })
})
