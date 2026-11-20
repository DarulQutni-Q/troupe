import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredAgentConfig } from '@/lib/acp-agents-persistence'
import type { SupportedAcpAgentEntry } from '@/lib/agents/supported-acp-agents'
import { useAcpStore } from '@/stores/acp-store'
import {
  type InstallableAgentEntry,
  installSupportedAgent,
  isInstallable,
  saveSupportedAgentConfig
} from './agent-setup'

const { mockInstallAcpAgent, mockLog } = vi.hoisted(() => ({
  mockInstallAcpAgent: vi.fn(),
  mockLog: vi.fn()
}))

vi.mock('@/lib/acp-api', () => ({ acpApi: { installAcpAgent: mockInstallAcpAgent } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mockLog }))

const saveAgentConfig = vi.fn<(config: StoredAgentConfig) => Promise<void>>()

function entry(overrides: Partial<SupportedAcpAgentEntry> = {}): SupportedAcpAgentEntry {
  return {
    id: 'gemini',
    configId: 'acp-registry:gemini',
    agent: {
      id: 'gemini',
      name: 'Gemini CLI',
      version: '1.0.0',
      description: '',
      distribution: {}
    },
    config: null,
    status: 'install-required',
    install: {
      kind: 'archive',
      archiveUrl: 'https://example.test/gemini.tgz',
      cmd: 'gemini',
      args: ['--acp'],
      env: { GEMINI_MODE: 'acp' }
    },
    manualInstall: null,
    runtimeLauncher: null,
    unavailableReason: null,
    ...overrides
  }
}

function installable(overrides: Partial<SupportedAcpAgentEntry> = {}): InstallableAgentEntry {
  const e = entry(overrides)
  if (!isInstallable(e)) throw new Error('fixture has no install spec')
  return e
}

const savedGemini: StoredAgentConfig = {
  id: 'acp-registry:gemini',
  templateId: 'gemini',
  configId: 'acp-registry:gemini',
  name: 'Gemini CLI',
  command: '/home/u/.troupe/agents/gemini/gemini',
  args: ['--acp'],
  env: { GEMINI_MODE: 'acp' },
  allowTerminal: false
}

beforeEach(() => {
  vi.clearAllMocks()
  saveAgentConfig.mockResolvedValue(undefined)
  useAcpStore.setState({ agentConfigs: [], saveAgentConfig })
})

describe('installSupportedAgent', () => {
  it('saves and returns the launch config built from the host outcome with the archive env', async () => {
    mockInstallAcpAgent.mockResolvedValue({
      command: '/home/u/.troupe/agents/gemini/gemini',
      args: ['--acp']
    })

    const config = await installSupportedAgent(installable())

    expect(mockInstallAcpAgent).toHaveBeenCalledWith('gemini')
    expect(config).toEqual(savedGemini)
    expect(saveAgentConfig).toHaveBeenCalledWith(savedGemini)
  })

  it('uses no env for a managed npm install', async () => {
    mockInstallAcpAgent.mockResolvedValue({ command: '/opt/claude/bin/claude-acp', args: [] })

    const config = await installSupportedAgent(
      installable({
        id: 'claude-acp',
        configId: 'acp-registry:claude-acp',
        agent: {
          id: 'claude-acp',
          name: 'Claude Code',
          version: '1',
          description: '',
          distribution: {}
        },
        install: { kind: 'managed-npm', package: '@agentclientprotocol/claude-agent-acp' }
      })
    )

    expect(config).toEqual({
      id: 'acp-registry:claude-acp',
      templateId: 'claude-acp',
      configId: 'acp-registry:claude-acp',
      name: 'Claude Code',
      command: '/opt/claude/bin/claude-acp',
      args: [],
      env: {},
      allowTerminal: false
    })
  })

  it('joins an install already running for the same agent', async () => {
    let finish: (value: { command: string; args: string[] }) => void = () => {}
    mockInstallAcpAgent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )

    const first = installSupportedAgent(installable())
    const second = installSupportedAgent(installable())
    finish({ command: '/home/u/.troupe/agents/gemini/gemini', args: ['--acp'] })

    expect(second).toBe(first)
    expect(await second).toEqual(savedGemini)
    expect(mockInstallAcpAgent).toHaveBeenCalledTimes(1)
    expect(saveAgentConfig).toHaveBeenCalledTimes(1)
  })

  it('saves nothing and logs a warning when the host install fails, then allows a retry', async () => {
    mockInstallAcpAgent.mockRejectedValueOnce(new Error('checksum mismatch'))

    await expect(installSupportedAgent(installable())).rejects.toThrow('checksum mismatch')

    expect(saveAgentConfig).not.toHaveBeenCalled()
    expect(mockLog).toHaveBeenCalledWith({
      level: 'warn',
      source: 'agents.install',
      message: 'Install of gemini failed: Error: checksum mismatch'
    })

    mockInstallAcpAgent.mockResolvedValueOnce({
      command: '/home/u/.troupe/agents/gemini/gemini',
      args: ['--acp']
    })
    expect(await installSupportedAgent(installable())).toEqual(savedGemini)
    expect(mockInstallAcpAgent).toHaveBeenCalledTimes(2)
  })
})

describe('saveSupportedAgentConfig', () => {
  it('saves a catalog-derived config once and returns its id', async () => {
    const ready = entry({ status: 'ready', install: null, config: savedGemini })

    expect(await saveSupportedAgentConfig(ready)).toBe('acp-registry:gemini')
    expect(saveAgentConfig).toHaveBeenCalledWith(savedGemini)

    useAcpStore.setState({ agentConfigs: [savedGemini] })
    saveAgentConfig.mockClear()
    expect(await saveSupportedAgentConfig(ready)).toBe('acp-registry:gemini')
    expect(saveAgentConfig).not.toHaveBeenCalled()
  })

  it('returns the entry config id without saving when the entry has no config', async () => {
    expect(await saveSupportedAgentConfig(entry({ status: 'ready', config: null }))).toBe(
      'acp-registry:gemini'
    )
    expect(saveAgentConfig).not.toHaveBeenCalled()
  })
})
