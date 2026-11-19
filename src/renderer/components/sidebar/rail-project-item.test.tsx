import { fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { mockSessionIndexEntry } from '@/lib/test-utils/acp'
import { resetChatActivity, seedChatActivity } from '@/lib/test-utils/chat-activity'
import { useAcpStore } from '@/stores/acp-store'
import { useAgentChatLifetimeStore } from '@/stores/agent-chat-lifetime-store'
import { resetShellLayoutStoreForTests, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Project } from '@/types/project'
import type { ProjectItemProps } from './project-item'
import { attentionOutsideRows, RailProjectItem } from './rail-project-item'

const WT = '/repo/.termul/worktrees/feat'

const project = {
  id: 'p1',
  name: 'Alpha',
  path: '/repo',
  color: 'blue',
  isGitRepo: false,
  worktrees: [
    {
      id: 'wt',
      name: 'feat',
      branch: 'feat',
      path: WT,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]
} as Project

const mocks = vi.hoisted(() => ({
  addAgentChatTab: vi.fn(),
  requestFocus: vi.fn(),
  logFrontendError: vi.fn()
}))

vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.logFrontendError }))

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: TooltipProvider })

function chat(id: string, cwd: string) {
  return mockSessionIndexEntry({
    id,
    title: `Chat ${id}`,
    cwd,
    projectId: 'p1',
    status: 'active',
    lastActivityAt: 1
  })
}

function renderRow(props: Partial<ProjectItemProps> = {}) {
  const onClick = vi.fn()
  const onOpenNeedsYou = vi.fn()
  render(
    <RailProjectItem
      project={project}
      isActive
      isEditing={false}
      editName=""
      status={{ live: null, attentionCount: 99, crashed: false }}
      onOpenNeedsYou={onOpenNeedsYou}
      onClick={onClick}
      onNewChat={vi.fn()}
      onContextMenu={vi.fn()}
      onEditNameChange={vi.fn()}
      onSaveRename={vi.fn()}
      onCancelRename={vi.fn()}
      onSettingsClick={vi.fn()}
      {...props}
    />
  )
  return { onClick, onOpenNeedsYou }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetShellLayoutStoreForTests()
  useShellLayoutStore.setState({ status: 'ready' })
  resetChatActivity()
  useAcpStore.setState({
    sessionIndex: [chat('here', WT), chat('there', '/repo')],
    sessions: {},
    agentStatus: {}
  })
  useWorkspaceStore.setState({
    activePaneId: 'pane-1',
    addAgentChatTab: mocks.addAgentChatTab,
    root: { type: 'leaf', id: 'pane-1', tabs: [], activeTabId: null }
  } as never)
  useAgentChatLifetimeStore.setState({ requestFocus: mocks.requestFocus })
  seedChatActivity({
    here: { needsYou: true, projectId: 'p1' },
    there: { needsYou: true, projectId: 'p1' }
  })
})

describe('attentionOutsideRows', () => {
  it('keeps a folded chain member whose row does not render that session', () => {
    const needsYou = new Map([
      ['here', 'p1'],
      ['old', 'p1'],
      ['there', 'p1'],
      ['other', 'p2']
    ])
    expect(
      attentionOutsideRows('p1', needsYou, [{ entry: { id: 'here', chainIds: ['here', 'old'] } }])
    ).toEqual({ count: 2, sessionId: 'old' })
  })

  it('keeps a needs-you chat that sits behind Show more, and keeps the open chat covered', () => {
    const cards = Array.from({ length: 6 }, (_, index) => ({ entry: { id: `c${index}` } }))
    const needsYou = new Map([
      ['c5', 'p1'],
      ['c0', 'p1']
    ])
    expect(attentionOutsideRows('p1', needsYou, cards, null)).toEqual({
      count: 1,
      sessionId: 'c5'
    })
    expect(attentionOutsideRows('p1', needsYou, cards, 'c5')).toEqual({
      count: 0,
      sessionId: undefined
    })
  })
})

describe('RailProjectItem needs-you outside the picked worktree', () => {
  it('keeps a count for a needs-you chat the picked worktree does not list', () => {
    useShellLayoutStore.getState().setWorktreePick('p1', WT)
    const { onClick } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: '1 needs you' }))
    expect(mocks.addAgentChatTab).toHaveBeenCalledWith('there')
    expect(onClick).not.toHaveBeenCalled()
    expect(mocks.requestFocus).not.toHaveBeenCalled()
  })

  it('asks another project to focus that chat, then opens the project', () => {
    useShellLayoutStore.getState().setWorktreePick('p1', WT)
    const { onClick, onOpenNeedsYou } = renderRow({ isActive: false })
    fireEvent.click(screen.getByRole('button', { name: '1 needs you' }))
    expect(mocks.requestFocus).toHaveBeenCalledWith('p1', 'there')
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(mocks.addAgentChatTab).not.toHaveBeenCalled()
    expect(onOpenNeedsYou).not.toHaveBeenCalled()
  })

  it('drops the count when every needs-you chat has a row', () => {
    renderRow()
    expect(screen.queryByRole('button', { name: /needs you/ })).not.toBeInTheDocument()
  })

  it('keeps the full project count while the chat list is hidden', () => {
    useShellLayoutStore.getState().setWorktreePick('p1', WT)
    useShellLayoutStore.getState().setProjectChatsHidden('p1', true)
    renderRow({ status: { live: null, attentionCount: 2, crashed: false } })
    expect(screen.getByRole('button', { name: '2 need you' })).toBeInTheDocument()
  })
})
