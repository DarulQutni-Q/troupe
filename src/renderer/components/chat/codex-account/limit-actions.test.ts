import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { agentReuseKey } from '@/stores/acp-reuse-keys'
import { useAcpStore } from '@/stores/acp-store'
import { FRESH } from '@/stores/acp-store/testkit'
import { applyCodexLimitAction, FOLLOW_WAIT_MS, useCodexResumeAt } from './limit-actions'
import { useCodexResumeStore } from './use-codex-limit'

const api = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/codex-accounts-api', () => ({ codexAccountsApi: api }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))

const accounts = (chatAccounts: Record<string, string>) => ({
  accounts: [
    { id: 'default', name: 'Personal', builtin: true, signedIn: true },
    { id: 'ab12', name: 'Work', builtin: false, signedIn: true }
  ],
  defaultAccountId: 'default',
  projectAccounts: {},
  chatAccounts,
  autoSwitch: true
})

beforeEach(() => {
  vi.clearAllMocks()
  api.list.mockResolvedValue(accounts({ s1: 'ab12' }))
  useCodexResumeAt.setState({}, true)
  useCodexResumeStore.setState({ at: {}, turns: {}, timers: {} })
})

function seed(agentId: string, liveAgents: string[]): void {
  useAcpStore.setState({
    ...FRESH,
    sessions: {
      s1: {
        id: 's1',
        agentId,
        cwd: '/work',
        projectId: 'office',
        status: 'closed',
        title: null,
        activeTurn: false,
        openTurnId: null,
        modes: null,
        models: null,
        configOptions: [],
        lastError: null,
        createdAt: 1
      }
    },
    agentStatus: Object.fromEntries(liveAgents.map((id) => [id, 'connected'])),
    sessionUsage: {
      s1: {
        used: 1,
        size: 10,
        baselineUsed: 1,
        updatedAt: 1,
        source: 'reported',
        rateLimit: { status: 'rejected', resetsAt: 1, kind: 'five_hour', percent: 100 }
      }
    }
  } as never)
}

const switched = {
  sessionId: 's1',
  projectId: 'office',
  action: 'switched' as const,
  from: { id: 'default', name: 'Personal' },
  to: { id: 'ab12', name: 'Work' },
  fromAgentId: 'old',
  newAgentId: 'new'
}

describe('applyCodexLimitAction', () => {
  it('points a chat the host moved at the new agent and clears its limit', () => {
    seed('old', ['new'])
    applyCodexLimitAction(switched)
    const state = useAcpStore.getState()
    expect(state.sessions.s1.agentId).toBe('new')
    expect(state.sessions.s1.status).toBe('active')
    expect(state.sessionUsage.s1.rateLimit).toBeUndefined()
    expect(toast.success).toHaveBeenCalledWith('Personal reached its limit. Continued on Work.')
  })

  it('registers the new agent under the chat key so a reopen does not reuse the old one', async () => {
    const chatKey = agentReuseKey('acp-registry:codex-acp', '/work', 'office', 's1')
    seed('old', ['new'])
    useAcpStore.setState({ configToLiveAgent: { [chatKey]: 'old' } })
    applyCodexLimitAction(switched)
    await vi.waitFor(() => expect(useAcpStore.getState().configToLiveAgent[chatKey]).toBe('new'))
  })

  it('leaves a chat alone when the event names an agent it no longer runs on', () => {
    seed('later', ['later'])
    applyCodexLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('later')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('follows the new agent once it connects here after the event', () => {
    seed('old', [])
    applyCodexLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('old')
    useAcpStore.setState((s) => ({ agentStatus: { ...s.agentStatus, new: 'connected' } }))
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('new')
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it('stops waiting for a new agent that never connects here', () => {
    vi.useFakeTimers()
    try {
      seed('old', [])
      applyCodexLimitAction(switched)
      vi.advanceTimersByTime(FOLLOW_WAIT_MS)
      useAcpStore.setState((s) => ({ agentStatus: { ...s.agentStatus, new: 'connected' } }))
      expect(useAcpStore.getState().sessions.s1.agentId).toBe('old')
      expect(toast.success).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a resume the host scheduled and clears it when the chat continues', () => {
    seed('reaped', ['fresh'])
    applyCodexLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resume_scheduled',
      at: 1_900_000_000_000
    })
    expect(useCodexResumeAt.getState()).toEqual({ s1: 1_900_000_000_000 })
    expect(useCodexResumeStore.getState().at.s1).toBe(1_900_000_000_000)
    applyCodexLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resumed',
      fromAgentId: 'reaped',
      newAgentId: 'fresh'
    })
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('fresh')
    expect(useCodexResumeAt.getState()).toEqual({})
    expect(useCodexResumeStore.getState().at.s1).toBeUndefined()
  })

  it('reports each failed continue once', () => {
    seed('old', [])
    const failed = {
      sessionId: 's1',
      projectId: 'office',
      action: 'failed' as const,
      reason: 'The host restarted while this chat waited for its limit to reset.'
    }
    applyCodexLimitAction(failed, 7)
    applyCodexLimitAction(failed, 7)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    applyCodexLimitAction(failed, 12)
    expect(toast.warning).toHaveBeenCalledTimes(2)
  })
})
