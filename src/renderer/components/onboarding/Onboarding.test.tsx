import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSignIn } from '@/lib/agents/agent-setup'
import type { SupportedAcpAgentEntry } from '@/lib/agents/supported-acp-agents'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { useGitStatusStore } from '@/stores/git-status-store'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types/project'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'
import { Onboarding } from './Onboarding'

const mocks = vi.hoisted(() => ({
  entries: [] as SupportedAcpAgentEntry[],
  signIn: {} as Record<string, AgentSignIn>,
  install: vi.fn(),
  pickFolder: vi.fn(),
  land: vi.fn(),
  log: vi.fn()
}))

vi.mock('@/hooks/use-resolved-supported-acp-agents', () => ({
  useSupportedAcpAgentCatalog: () => ({ entries: mocks.entries, checking: false, recheck: vi.fn() })
}))
vi.mock('@/hooks/use-provider-sign-in', () => ({
  useProviderSignIn: () => ({
    of: (id: string) => mocks.signIn[id] ?? null,
    providerOf: () => null,
    reload: vi.fn().mockResolvedValue(undefined)
  })
}))
vi.mock('@/lib/agents/agent-setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agents/agent-setup')>()),
  installSupportedAgent: mocks.install
}))
vi.mock('@/hooks/use-app-settings', () => ({
  useUpdateAppSetting: () => (key: 'appearanceMode', value: 'dark' | 'light') =>
    useAppSettingsStore.getState().updateSetting(key, value)
}))
vi.mock('@/lib/project-folder', () => ({
  pickFolderAsProject: mocks.pickFolder,
  addFolderAsProject: vi.fn()
}))
vi.mock('@/components/NewProjectModal', () => ({ NewProjectModal: () => null }))
vi.mock('./land-onboarding', () => ({ landOnboarding: mocks.land }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mocks.log }))

function agent(id: string, name: string, overrides: Partial<SupportedAcpAgentEntry> = {}) {
  return {
    id,
    configId: `acp-registry:${id}`,
    agent: { id, name, version: '1.0.0', description: '', distribution: {} },
    config: null,
    status: 'ready',
    install: null,
    manualInstall: null,
    runtimeLauncher: null,
    unavailableReason: 'Install Claude Code, then put `claude` on your PATH.',
    ...overrides
  } satisfies SupportedAcpAgentEntry
}

const claude = agent('claude-acp', 'Claude Code', { installedVersion: '2.1.4' })
const codex = agent('codex-acp', 'Codex')
const gemini = agent('gemini', 'Gemini CLI', {
  status: 'install-required',
  install: { kind: 'managed-npm', package: '@google/gemini-cli' }
})
const cursor = agent('cursor', 'Cursor', {
  status: 'manual-install',
  manualInstall: { cmd: 'cursor-agent', args: [], env: {} }
})
const pi = agent('pi-acp', 'pi', { status: 'needs-runtime', runtimeLauncher: 'npx' })

const myApp: Project = { id: 'p-app', name: 'my-app', color: 'blue', path: '/home/u/code/my-app' }

function row(name: string): HTMLElement {
  const option = screen.getAllByRole('option').find((el) => within(el).queryByText(name) !== null)
  if (!option) throw new Error(`no row for ${name}`)
  return option
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.entries = [claude, codex, gemini, cursor, pi]
  mocks.signIn = { 'claude-acp': 'ready', 'codex-acp': 'signed-out' }
  mocks.land.mockResolvedValue(undefined)
  useAppSettingsStore.setState({ settings: { ...DEFAULT_APP_SETTINGS }, isLoaded: true })
  useProjectStore.setState({ projects: [] })
  useGitStatusStore.setState({
    fetchCommitContext: vi.fn().mockResolvedValue(null)
  })
})

describe('Onboarding', () => {
  it('walks welcome, agents and project, then lands with the picks', async () => {
    const onClose = vi.fn()
    render(<Onboarding onClose={onClose} />)

    expect(screen.getByRole('heading', { name: 'Welcome to Troupe' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'System' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(useAppSettingsStore.getState().settings.appearanceMode).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    expect(screen.getByRole('heading', { name: 'Check your agents' })).toBeInTheDocument()
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Found 1 ready on this computer')).toBeInTheDocument()
    expect(within(row('Claude Code')).getByText('Ready')).toBeInTheDocument()
    expect(row('Claude Code')).toHaveAttribute('aria-selected', 'true')
    expect(within(row('Codex')).getByText('Needs sign-in')).toBeInTheDocument()
    expect(within(row('Gemini CLI')).getByText('Not installed')).toBeInTheDocument()
    expect(within(row('pi')).getByText('Needs Node.js')).toBeInTheDocument()
    expect(within(row('pi')).getByText('Install Node.js, then restart Troupe')).toBeInTheDocument()

    fireEvent.click(within(row('Cursor')).getByRole('button', { name: 'How to install' }))
    expect(
      screen.getByText(
        'Install Cursor from its vendor, then make sure `cursor-agent` is on your PATH.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Install Claude Code, then put `claude` on your PATH.')
    ).not.toBeInTheDocument()

    fireEvent.click(row('Codex'))
    expect(row('Claude Code')).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Claude Code' }))

    expect(screen.getByRole('heading', { name: 'Where should agents work?' })).toBeInTheDocument()
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    mocks.pickFolder.mockImplementation(async () => {
      useProjectStore.setState({ projects: [myApp] })
      return { kind: 'added', project: myApp }
    })
    fireEvent.click(screen.getByRole('button', { name: /Open a folder/ }))

    expect(await screen.findByText('my-app')).toBeInTheDocument()
    expect(screen.getByText('/home/u/code/my-app')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(mocks.land).toHaveBeenCalledTimes(1)
    expect(mocks.land).toHaveBeenCalledWith({ agent: claude, projectId: 'p-app' }, onClose)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('installs a row agent from its Install action', async () => {
    mocks.install.mockResolvedValue({ id: 'acp-registry:gemini' })
    render(<Onboarding onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    fireEvent.click(within(row('Gemini CLI')).getByRole('button', { name: 'Install' }))

    expect(within(row('Gemini CLI')).getByText('Installing…')).toBeInTheDocument()
    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith(gemini))
    await waitFor(() =>
      expect(mocks.log).toHaveBeenCalledWith({
        level: 'info',
        source: 'onboarding',
        message: 'Installed gemini'
      })
    )
  })

  it('lets a user with no ready agent set up later and skip to the workspace', () => {
    mocks.entries = [gemini, cursor]
    const onClose = vi.fn()
    render(<Onboarding onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))

    expect(screen.getByText('Install or sign in to one agent to continue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Set up later' }))

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(mocks.land).toHaveBeenCalledWith({ agent: null, projectId: null }, onClose)
  })

  it('keeps the agent pick when the user goes back from the project step', () => {
    render(<Onboarding onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    mocks.signIn = { 'claude-acp': 'ready', 'codex-acp': 'ready' }

    fireEvent.click(row('Claude Code'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Claude Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(row('Claude Code')).toHaveAttribute('aria-selected', 'true')
    expect(row('Codex')).toHaveAttribute('aria-selected', 'false')
  })
})
