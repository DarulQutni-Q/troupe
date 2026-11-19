import type { CodexAccountUsage } from '@shared/types/codex-accounts.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logFrontendError } from '@/lib/log-api'
import { useAcpStore } from '@/stores/acp-store'
import { FRESH } from '@/stores/acp-store/testkit'
import { decideAutoSwitch, startCodexAutoSwitch } from './auto-switch'
import { useCodexResumeStore } from './use-codex-limit'
import type { CodexAccountChoice } from './use-project-codex-account'

const { api, switcher } = vi.hoisted(() => ({
  api: { list: vi.fn(), usage: vi.fn() },
  switcher: {
    switchProjectCodexAccount: vi.fn(),
    applyProjectCodexAccount: vi.fn(),
    isChatOpenHere: vi.fn(),
    restartCodexSession: vi.fn()
  }
}))

vi.mock('@/lib/codex-accounts-api', () => ({ codexAccountsApi: api }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
}))
vi.mock('@/stores/codex-account-switch', async () => {
  const actual = await vi.importActual<typeof import('@/stores/codex-account-switch')>(
    '@/stores/codex-account-switch'
  )
  return {
    ...actual,
    switchProjectCodexAccount: switcher.switchProjectCodexAccount,
    applyProjectCodexAccount: switcher.applyProjectCodexAccount,
    isChatOpenHere: switcher.isChatOpenHere,
    restartCodexSession: switcher.restartCodexSession
  }
})

const account = (id: string, name: string) => ({
  id,
  name,
  builtin: id === 'default',
  signedIn: true
})

const choice = (id: string, name: string, percent: number): CodexAccountChoice => ({
  account: account(id, name),
  usage: undefined,
  window: { kind: 'session', percent, resetsAt: null, windowDurationMins: 300 }
})

const limit = (resetsAt: number | null) => ({
  status: 'rejected' as const,
  resetsAt,
  kind: 'five_hour',
  percent: 100,
  overageInUse: false
})

describe('decideAutoSwitch', () => {
  const work = choice('ab12', 'Work', 4)
  const base = { limit: limit(2_000), autoSwitch: true, limited: new Map(), now: 1_000_000 }

  it('does nothing when automatic switching is off', () => {
    expect(decideAutoSwitch({ ...base, autoSwitch: false, candidates: [work] })).toEqual({
      kind: 'none',
      reason: 'off'
    })
  })

  it('switches to the account with the most room', () => {
    expect(decideAutoSwitch({ ...base, candidates: [work] })).toEqual({ kind: 'switch', to: work })
  })

  it('continues at the reset when no account has room', () => {
    expect(decideAutoSwitch({ ...base, candidates: [] })).toEqual({ kind: 'resume', at: 2_000_000 })
  })
})

const read = (
  accountId: string,
  percent: number,
  resetsAt: string | null = null
): CodexAccountUsage => ({
  accountId,
  status: 'ok',
  planType: 'plus',
  windows: [{ kind: 'session', percent, resetsAt, windowDurationMins: 300 }],
  checkedAt: 1,
  message: null
})

const snapshot = (autoSwitch = true) => ({
  accounts: [account('default', 'Personal'), account('ab12', 'Work'), account('cd34', 'Side')],
  defaultAccountId: 'default',
  projectAccounts: {} as Record<string, string>,
  chatAccounts: {} as Record<string, string>,
  autoSwitch
})

function seed(): void {
  useAcpStore.setState({
    ...FRESH,
    sessions: {
      s1: {
        id: 's1',
        agentId: 'a1',
        cwd: '/work',
        projectId: 'office',
        status: 'active',
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
    configToLiveAgent: { 'acp-registry:codex-acp\0/work\0project\0office': 'a1' },
    sessionUsage: {}
  } as never)
}

function setLimit(resetsAt: number | null): void {
  useAcpStore.setState({
    sessionUsage: {
      s1: {
        used: 1,
        size: 10,
        baselineUsed: 1,
        updatedAt: 1,
        source: 'reported',
        rateLimit: limit(resetsAt)
      }
    }
  } as never)
}

describe('startCodexAutoSwitch', () => {
  let stop: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    seed()
    api.list.mockResolvedValue(snapshot())
    api.usage.mockResolvedValue([read('default', 40), read('ab12', 4), read('cd34', 40)])
    switcher.switchProjectCodexAccount.mockResolvedValue(['s1'])
    switcher.applyProjectCodexAccount.mockResolvedValue(['s1'])
    switcher.isChatOpenHere.mockReturnValue(true)
    switcher.restartCodexSession.mockResolvedValue(true)
    stop = startCodexAutoSwitch()
  })

  afterEach(() => {
    stop()
    useCodexResumeStore.getState().cancel('s1')
  })

  it('does not move the project or resend the last prompt; the host continues the chat', async () => {
    setLimit(1_900_000_000)
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(logFrontendError)
          .mock.calls.map(([entry]) => (entry as { message: string }).message)
          .some((message) => message.includes('the host continues them'))
      ).toBe(true)
    )
    expect(switcher.switchProjectCodexAccount).not.toHaveBeenCalled()
    expect(switcher.restartCodexSession).not.toHaveBeenCalled()
    expect(useCodexResumeStore.getState().at.s1).toBeUndefined()
  })
})
