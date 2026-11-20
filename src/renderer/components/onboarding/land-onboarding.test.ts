import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupportedAcpAgentEntry } from '@/lib/agents/supported-acp-agents'
import { landOnboarding, onboardingLanding } from './land-onboarding'

const calls: string[] = []
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remember: vi.fn(),
  write: vi.fn(),
  openNewChat: vi.fn(),
  openNewQuickChat: vi.fn(),
  log: vi.fn()
}))

vi.mock('@/lib/agents/agent-setup', () => ({ saveSupportedAgentConfig: mocks.save }))
vi.mock('@/components/chat/new-chat/new-chat-agent', () => ({
  rememberNewChatAgent: mocks.remember
}))
vi.mock('@/hooks/use-app-settings', () => ({ writeAppSettingsNow: mocks.write }))
vi.mock('@/components/chat/new-chat/open-new-chat', () => ({
  openNewChat: mocks.openNewChat,
  openNewQuickChat: mocks.openNewQuickChat
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.log }))

const codex = { id: 'codex-acp', configId: 'acp-registry:codex-acp' } as SupportedAcpAgentEntry

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  vi.useFakeTimers({ now: new Date('2026-11-20T08:00:00.000Z'), toFake: ['Date'] })
  mocks.save.mockImplementation(async () => {
    calls.push('save')
    return 'acp-registry:codex-acp'
  })
  mocks.remember.mockImplementation((id: string) => calls.push(`remember ${id}`))
  mocks.write.mockImplementation(async (updates: { onboardingCompletedAt: string }) => {
    calls.push(`write ${updates.onboardingCompletedAt}`)
    return { success: true, data: undefined }
  })
  mocks.openNewChat.mockImplementation(async (req: { projectId: string; reason: string }) => {
    calls.push(`openNewChat ${req.projectId} ${req.reason}`)
  })
  mocks.openNewQuickChat.mockImplementation(async (reason: string) => {
    calls.push(`openNewQuickChat ${reason}`)
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const close = () => calls.push('close')

describe('onboardingLanding', () => {
  it('maps the picks to one landing', () => {
    expect(onboardingLanding({ agent: codex, projectId: 'p1' })).toEqual({
      kind: 'launcher',
      projectId: 'p1'
    })
    expect(onboardingLanding({ agent: null, projectId: 'p1' })).toEqual({
      kind: 'launcher',
      projectId: 'p1'
    })
    expect(onboardingLanding({ agent: codex, projectId: null })).toEqual({ kind: 'quick-chat' })
    expect(onboardingLanding({ agent: null, projectId: null })).toEqual({ kind: 'workspace' })
  })
})

describe('landOnboarding', () => {
  it('saves and remembers the agent, records completion, closes, then opens the launcher', async () => {
    await landOnboarding({ agent: codex, projectId: 'p1' }, close)

    expect(calls).toEqual([
      'save',
      'remember acp-registry:codex-acp',
      'write 2026-11-20T08:00:00.000Z',
      'close',
      'openNewChat p1 onboarding'
    ])
  })

  it('opens a quick chat on Skip with an agent', async () => {
    await landOnboarding({ agent: codex, projectId: null }, close)

    expect(calls.slice(-2)).toEqual(['close', 'openNewQuickChat onboarding'])
  })

  it('only records completion and closes with no agent and no project', async () => {
    await landOnboarding({ agent: null, projectId: null }, close)

    expect(calls).toEqual(['write 2026-11-20T08:00:00.000Z', 'close'])
  })

  it('still lands when the agent save and the completion write fail', async () => {
    mocks.save.mockRejectedValueOnce(new Error('store down'))
    mocks.write.mockResolvedValueOnce({ success: false, error: 'no', code: 'STORE_NOT_HYDRATED' })

    await landOnboarding({ agent: codex, projectId: 'p1' }, close)

    expect(calls).toEqual(['close', 'openNewChat p1 onboarding'])
    expect(mocks.log).toHaveBeenCalledWith({
      level: 'warn',
      source: 'onboarding',
      message: 'Recording completion failed (STORE_NOT_HYDRATED)'
    })
  })
})
