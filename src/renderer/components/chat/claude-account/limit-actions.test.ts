import type { ClaudeRateLimit } from '@shared/types/claude-accounts.types'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAcpStore } from '@/stores/acp-store'
import { FRESH } from '@/stores/acp-store/testkit'
import { applyClaudeLimitAction, useClaudeResumeAt } from './limit-actions'

vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))

const rejected: ClaudeRateLimit = {
  status: 'rejected',
  resetsAt: 1_900_000_000,
  kind: 'five_hour',
  percent: 100,
  overageInUse: false
}

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
        rateLimit: rejected
      }
    }
  } as never)
}

const switched = {
  sessionId: 's1',
  projectId: 'office',
  action: 'switched' as const,
  from: { id: 'ab12', name: 'Work' },
  to: { id: 'cd34', name: 'Side' },
  fromAgentId: 'old',
  newAgentId: 'new'
}

beforeEach(() => {
  vi.clearAllMocks()
  useClaudeResumeAt.setState({}, true)
})

describe('applyClaudeLimitAction', () => {
  it('points a chat the host moved at the new agent and clears its limit', () => {
    seed('old', ['new'])
    applyClaudeLimitAction(switched)
    const state = useAcpStore.getState()
    expect(state.sessions.s1.agentId).toBe('new')
    expect(state.sessions.s1.status).toBe('active')
    expect(state.sessionUsage.s1).toEqual({
      used: 1,
      size: 10,
      baselineUsed: 1,
      updatedAt: 1,
      source: 'reported'
    })
    expect(toast.success).toHaveBeenCalledWith('Work reached its limit. Continued on Side.')
  })

  it('leaves a chat alone when a replayed event names an agent it no longer runs on', () => {
    seed('later', ['later'])
    applyClaudeLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('later')
    expect(useAcpStore.getState().sessionUsage.s1.rateLimit).toEqual(rejected)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('leaves a chat alone when the new agent is not live here', () => {
    seed('old', [])
    applyClaudeLimitAction(switched)
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('old')
  })

  it('follows the agent a resume at the reset started, and clears the scheduled time', () => {
    seed('reaped', ['fresh'])
    applyClaudeLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resume_scheduled',
      at: 1_900_000_000_000
    })
    expect(useClaudeResumeAt.getState()).toEqual({ s1: 1_900_000_000_000 })
    applyClaudeLimitAction({
      sessionId: 's1',
      projectId: 'office',
      action: 'resumed',
      fromAgentId: 'reaped',
      newAgentId: 'fresh'
    })
    expect(useAcpStore.getState().sessions.s1.agentId).toBe('fresh')
    expect(useClaudeResumeAt.getState()).toEqual({})
  })

  it('reports a failed continue once', () => {
    seed('old', [])
    const failed = {
      sessionId: 's1',
      projectId: 'office',
      action: 'failed' as const,
      reason: 'The host restarted while this chat waited for its limit to reset.'
    }
    applyClaudeLimitAction(failed)
    applyClaudeLimitAction(failed)
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith('Troupe could not continue the chat', {
      description: 'The host restarted while this chat waited for its limit to reset.'
    })
  })
})
