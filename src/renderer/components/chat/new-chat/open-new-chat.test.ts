import { PersistenceKeys } from '@shared/types/persistence.types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { read, write, resolveEntries, tauriRef, readComposerOptions } = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(async () => ({ success: true, data: undefined })),
  resolveEntries: vi.fn(),
  tauriRef: { current: true },
  readComposerOptions: vi.fn()
}))

vi.mock('@/lib/api', () => ({ persistenceApi: { read, write } }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn(async () => {}) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))
vi.mock('@/lib/tauri-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tauri-runtime')>()),
  isTauriContext: () => tauriRef.current
}))
vi.mock('@/lib/agents/supported-acp-agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agents/supported-acp-agents')>()),
  resolveSupportedAcpAgents: resolveEntries
}))
vi.mock('@/stores/acp-store/composer-options', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/acp-store/composer-options')>()),
  readComposerOptions
}))

import { useProjectSwitchStatus } from '@/lib/project-switch/status-store'
import { useAcpStore } from '@/stores/acp-store'
import { useProjectStore } from '@/stores/project-store'
import { useQuickChatStore } from '@/stores/quick-chat-store'
import { useShellLayoutStore } from '@/stores/shell-layout-store'
import { agentChatTabId, useWorkspaceStore } from '@/stores/workspace-store'
import {
  newChatPlaceholderOptions,
  openNewChat,
  openNewQuickChat,
  replaceEmptyChat
} from './open-new-chat'

const config = (id: string) => ({ id, name: id, command: 'agent', args: [] })
const entry = (id: string, status = 'ready') => ({
  id,
  configId: id,
  agent: { id, name: id },
  config: config(id),
  status
})

function pane(tabs: unknown[] = [], activeTabId: string | null = null): void {
  useWorkspaceStore.setState({
    root: { type: 'leaf', id: 'pane-1', tabs, activeTabId },
    activePaneId: 'pane-1',
    agentLauncherPaneId: null,
    activeProjectId: ''
  } as never)
}

function lastSelected(agentId: string | null): void {
  read.mockImplementation(async (key: string) =>
    key === PersistenceKeys.lastSelectedAgent && agentId
      ? { success: true, data: { agentId, mode: 'acp' } }
      : { success: false, error: 'missing', code: 'KEY_NOT_FOUND' }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  tauriRef.current = true
  useProjectStore.setState({
    activeProjectId: 'p1',
    projects: [{ id: 'p1', name: 'termul', path: '/work', isGitRepo: true }]
  } as never)
  useShellLayoutStore.setState({ worktreePickByProject: {} } as never)
  useAcpStore.setState({
    agentConfigs: [config('cfg-a'), config('cfg-b')],
    agentOptionsCache: {},
    sessions: {},
    messages: {},
    promptQueues: {},
    launchingSessionIds: {}
  } as never)
  resolveEntries.mockResolvedValue([entry('cfg-a'), entry('cfg-b')])
  readComposerOptions.mockResolvedValue(null)
  lastSelected('cfg-b')
  pane()
})

const { createLaunchPlaceholder, finalizeChatLaunch, saveAgentConfig, startChat } =
  useAcpStore.getState()

afterEach(() => {
  vi.restoreAllMocks()
  useAcpStore.setState({ createLaunchPlaceholder, finalizeChatLaunch, saveAgentConfig, startChat })
})

/** Stub the quick chat's launch; returns the stubs to read what they got. */
function stubQuickLaunch(): {
  createLaunchPlaceholder: ReturnType<typeof vi.fn>
  finalizeChatLaunch: ReturnType<typeof vi.fn>
} {
  useQuickChatStore.setState({ view: { mode: 'closed' } })
  const stubs = {
    createLaunchPlaceholder: vi.fn(() => 'launch-q'),
    finalizeChatLaunch: vi.fn(async () => 'sess-q')
  }
  useAcpStore.setState(stubs as never)
  return stubs
}

describe('openNewChat', () => {
  it('opens the launcher in the pane and starts no session', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    const placeholder = vi.fn(() => 'launch-x')
    const start = vi.fn(async () => 'sess-x')
    useAcpStore.setState({ createLaunchPlaceholder: placeholder, startChat: start } as never)

    expect(await openNewChat({ reason: 'rail' })).toEqual({ kind: 'launcher' })

    expect(useWorkspaceStore.getState().agentLauncherPaneId).toBe('pane-1')
    expect(useAcpStore.getState().sessions).toEqual({})
    expect(placeholder).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('puts focus in the launcher composer once it can take typing', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    const button = document.createElement('button')
    const paneEl = document.createElement('div')
    paneEl.dataset.paneContent = 'pane-1'
    const editor = document.createElement('div')
    editor.setAttribute('aria-label', 'Agent prompt')
    editor.setAttribute('contenteditable', 'false')
    editor.tabIndex = -1
    paneEl.append(editor)
    document.body.append(button, paneEl)
    button.focus()
    try {
      await openNewChat({ reason: 'rail' })
      await new Promise((resolve) => requestAnimationFrame(resolve))
      expect(document.activeElement).toBe(button)

      editor.setAttribute('contenteditable', 'true')
      await vi.waitFor(() => expect(document.activeElement).toBe(editor))
    } finally {
      button.remove()
      paneEl.remove()
    }
  })

  it("opens the launcher in the project row's project once its switch lands", async () => {
    useProjectStore.setState({
      activeProjectId: 'p2',
      projects: [
        { id: 'p1', name: 'termul', path: '/work', isGitRepo: true },
        { id: 'p2', name: 'other', path: '/other', isGitRepo: true }
      ]
    } as never)
    useWorkspaceStore.setState({ activeProjectId: 'p1' } as never)
    useProjectSwitchStatus.getState().apply({ kind: 'pending', projectId: 'p2' })

    const run = openNewChat({ projectId: 'p2', reason: 'project-row' })
    useWorkspaceStore.setState({
      activeProjectId: 'p2',
      root: { type: 'leaf', id: 'pane-2', tabs: [], activeTabId: null },
      activePaneId: 'pane-2'
    } as never)
    useProjectSwitchStatus.getState().apply({ kind: 'idle' })

    expect(await run).toEqual({ kind: 'launcher' })
    expect(useWorkspaceStore.getState().agentLauncherPaneId).toBe('pane-2')
  })

  it("opens no launcher for the selected project in the previous project's pane (slow switch)", async () => {
    // p2 is selected, but p1's tree (with pane-1) is still the one on screen.
    useWorkspaceStore.setState({ activeProjectId: 'p1' } as never)
    useProjectStore.setState({
      activeProjectId: 'p2',
      projects: [
        { id: 'p1', name: 'termul', path: '/work', isGitRepo: true },
        { id: 'p2', name: 'other', path: '/other', isGitRepo: true }
      ]
    } as never)

    expect(await openNewChat({ paneId: 'pane-1', reason: 'new-tab-menu' })).toEqual({
      kind: 'skipped'
    })
    expect(useWorkspaceStore.getState().agentLauncherPaneId).toBeNull()
  })

  it('closes the open quick chat so the launcher of a project New chat is visible', async () => {
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'quick-1' } })
    expect(await openNewChat({ reason: 'shortcut' })).toEqual({ kind: 'launcher' })
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'closed' })
  })

  it('opens an empty quick chat when no project is active, and does not open the launcher', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useProjectStore.setState({ activeProjectId: '', projects: [] } as never)
    const createLaunchPlaceholder = vi.fn(() => 'launch-q')
    const finalizeChatLaunch = vi.fn(async () => 'sess-q')
    useAcpStore.setState({ createLaunchPlaceholder, finalizeChatLaunch } as never)
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    const result = await openNewChat({ reason: 'rail' })

    expect(result).toEqual({ kind: 'opened', sessionId: 'launch-q' })
    expect(showAgentLauncher).not.toHaveBeenCalled()
    expect(createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({
        configId: 'cfg-b',
        cwd: '',
        projectId: '__unassigned__',
        kind: 'quick'
      })
    )
    expect(finalizeChatLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholderId: 'launch-q',
        configId: 'cfg-b',
        cwd: '',
        projectId: '__unassigned__'
      })
    )
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'launch-q' })
  })

  it('starts a quick chat from the Quick chats + while a project is active', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    const createLaunchPlaceholder = vi.fn(() => 'launch-q2')
    const finalizeChatLaunch = vi.fn(async () => 'sess-q2')
    useAcpStore.setState({ createLaunchPlaceholder, finalizeChatLaunch } as never)

    const result = await openNewQuickChat('quick-chats-header')

    expect(result).toEqual({ kind: 'opened', sessionId: 'launch-q2' })
    expect(createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: '__unassigned__', kind: 'quick' })
    )
    expect(useQuickChatStore.getState().view).toEqual({ mode: 'chat', sessionId: 'launch-q2' })
  })

  it('does not open the launcher when no project is active and no agent can start', async () => {
    useQuickChatStore.setState({ view: { mode: 'closed' } })
    useProjectStore.setState({ activeProjectId: '', projects: [] } as never)
    resolveEntries.mockResolvedValue([entry('cfg-b', 'install-required')])
    const showAgentLauncher = vi.spyOn(useWorkspaceStore.getState(), 'showAgentLauncher')

    expect(await openNewChat({ reason: 'rail' })).toEqual({ kind: 'skipped' })
    expect(showAgentLauncher).not.toHaveBeenCalled()
    expect(useQuickChatStore.getState().view.mode).toBe('closed')
  })
})

describe('openNewQuickChat', () => {
  it('opens one chat for a double press while the first is starting', async () => {
    const stubs = stubQuickLaunch()
    const [first, second] = await Promise.all([
      openNewQuickChat('quick-chats-header'),
      openNewQuickChat('quick-chats-header')
    ])
    expect(first).toEqual(second)
    expect(stubs.createLaunchPlaceholder).toHaveBeenCalledTimes(1)
  })

  it('focuses the empty quick chat the view already shows', async () => {
    const stubs = stubQuickLaunch()
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q-empty' } })
    useAcpStore.setState({
      sessions: { 'q-empty': { id: 'q-empty', kind: 'quick', status: 'active' } },
      messages: { 'q-empty': [] }
    } as never)

    expect(await openNewQuickChat('quick-chats-header')).toEqual({
      kind: 'focused',
      sessionId: 'q-empty'
    })
    expect(stubs.createLaunchPlaceholder).not.toHaveBeenCalled()
  })

  it('a quick chat with a queued message is not an empty chat to focus', async () => {
    stubQuickLaunch()
    useQuickChatStore.setState({ view: { mode: 'chat', sessionId: 'q-queued' } })
    useAcpStore.setState({
      sessions: { 'q-queued': { id: 'q-queued', kind: 'quick', status: 'active' } },
      messages: { 'q-queued': [] },
      promptQueues: {
        'q-queued': [{ id: 'q', blocks: [{ type: 'text', text: 'hi' }], createdAt: 1 }]
      }
    } as never)

    expect(await openNewQuickChat('quick-chats-header')).toEqual({
      kind: 'opened',
      sessionId: 'launch-q'
    })
  })

  it('on web never spawns a catalog agent nobody configured (#840)', async () => {
    tauriRef.current = false
    useAcpStore.setState({ agentConfigs: [] } as never)
    resolveEntries.mockResolvedValue([entry('acp-registry:codex')])
    lastSelected('acp-registry:codex')
    const stubs = stubQuickLaunch()

    expect(await openNewQuickChat('quick-chats-header')).toEqual({ kind: 'skipped' })
    expect(stubs.createLaunchPlaceholder).not.toHaveBeenCalled()
  })

  it('on web starts the last picked agent once it is configured', async () => {
    tauriRef.current = false
    const stubs = stubQuickLaunch()
    await openNewQuickChat('quick-chats-header')
    expect(stubs.createLaunchPlaceholder.mock.calls[0]?.[0].configId).toBe('cfg-b')
  })

  it('on web falls back to a configured default when the last pick is not configured', async () => {
    tauriRef.current = false
    useAcpStore.setState({ agentConfigs: [config('cfg-a')] } as never)
    const stubs = stubQuickLaunch()
    await openNewQuickChat('quick-chats-header')
    expect(stubs.createLaunchPlaceholder.mock.calls[0]?.[0].configId).toBe('cfg-a')
  })

  it('on desktop saves a catalog default before it starts', async () => {
    useAcpStore.setState({ agentConfigs: [] } as never)
    lastSelected(null)
    resolveEntries.mockResolvedValue([entry('acp-registry:codex')])
    const save = vi.fn(async () => {})
    useAcpStore.setState({ saveAgentConfig: save } as never)
    const stubs = stubQuickLaunch()

    await openNewQuickChat('quick-chats-header')

    expect(save).toHaveBeenCalledWith(config('acp-registry:codex'))
    expect(stubs.createLaunchPlaceholder.mock.calls[0]?.[0].configId).toBe('acp-registry:codex')
    expect(write).toHaveBeenCalledWith(PersistenceKeys.lastSelectedAgent, {
      agentId: 'acp-registry:codex',
      mode: 'acp'
    })
  })
})

describe('newChatPlaceholderOptions (the effort a new chat shows before it starts)', () => {
  const effort = (current: string) => ({
    id: 'effort',
    name: 'Effort',
    category: 'thought_level',
    type: 'select' as const,
    currentValue: current,
    options: ['low', 'medium', 'high'].map((value) => ({ value, name: value }))
  })
  const permission = {
    id: 'permission',
    name: 'Permission',
    category: 'mode',
    type: 'select' as const,
    currentValue: 'default',
    options: ['default', 'bypass'].map((value) => ({ value, name: value }))
  }
  // The agent's last session ran Opus at High: the cache holds its options.
  const cache = {
    models: {
      currentModelId: 'opus',
      availableModels: [
        { modelId: 'opus', name: 'Opus' },
        { modelId: 'haiku', name: 'Haiku' }
      ]
    },
    modes: null,
    configOptions: [effort('high'), permission]
  }

  it("drops another model's effort: the saved Haiku has no effort of its own", () => {
    const shown = newChatPlaceholderOptions(cache as never, {
      modelId: 'haiku',
      configValues: {}
    })
    expect(shown.models?.currentModelId).toBe('haiku')
    expect(shown.configOptions.find((o) => o.id === 'effort')).toBeUndefined()
    // Agent-wide options stay.
    expect(shown.configOptions.find((o) => o.id === 'permission')).toBeDefined()
  })

  it("paints the saved model's own effort", () => {
    const shown = newChatPlaceholderOptions(cache as never, {
      modelId: 'haiku',
      configValues: { effort: 'medium' }
    })
    expect(shown.configOptions.find((o) => o.id === 'effort')?.currentValue).toBe('medium')
  })

  it('keeps the cached effort when the saved model is the cached one', () => {
    const shown = newChatPlaceholderOptions(cache as never, { modelId: 'opus', configValues: {} })
    expect(shown.configOptions.find((o) => o.id === 'effort')?.currentValue).toBe('high')
  })

  it('a new quick chat paints no stale effort and sends none', async () => {
    readComposerOptions.mockResolvedValue({ modelId: 'haiku', modelValues: {} })
    useAcpStore.setState({
      agentOptionsCache: { 'cfg-b': { ...cache, updatedAt: 1 } }
    } as never)
    const stubs = stubQuickLaunch()

    await openNewQuickChat('quick-chats-header')

    const shown = stubs.createLaunchPlaceholder.mock.calls[0]?.[0]
    expect(shown.models.currentModelId).toBe('haiku')
    expect(shown.configOptions.find((o: { id: string }) => o.id === 'effort')).toBeUndefined()
    const { pending } = stubs.finalizeChatLaunch.mock.calls[0][0]
    expect(pending.modelId).toBe('haiku')
    expect(pending.configValues.effort).toBeUndefined()
  })
})

describe('replaceEmptyChat (another agent picked in an empty chat)', () => {
  function stubLaunch(): {
    createLaunchPlaceholder: ReturnType<typeof vi.fn>
    finalizeChatLaunch: ReturnType<typeof vi.fn>
    closeSession: ReturnType<typeof vi.fn>
    deleteHistorySession: ReturnType<typeof vi.fn>
    armAgentSwitch: ReturnType<typeof vi.fn>
  } {
    const stubs = {
      createLaunchPlaceholder: vi.fn(() => 'launch-r'),
      finalizeChatLaunch: vi.fn(async () => 'sess-r'),
      closeSession: vi.fn(async () => {}),
      deleteHistorySession: vi.fn(async () => {}),
      armAgentSwitch: vi.fn(async () => true)
    }
    useAcpStore.setState(stubs as never)
    return stubs
  }

  it('moves the empty chat to the new agent in the same tab, with no armed switch', async () => {
    const tabId = agentChatTabId('s-empty')
    pane([{ type: 'agent-chat', id: tabId, sessionId: 's-empty' }], tabId)
    useAcpStore.setState({
      sessions: {
        's-empty': { id: 's-empty', projectId: 'p1', cwd: '/work', status: 'active' }
      },
      messages: { 's-empty': [] }
    } as never)
    const stubs = stubLaunch()

    await replaceEmptyChat('s-empty', 'cfg-b', { modelId: 'glm-flash', modelConfigId: null })

    expect(stubs.createLaunchPlaceholder).toHaveBeenCalledWith(
      expect.objectContaining({ configId: 'cfg-b', cwd: '/work', projectId: 'p1' })
    )
    expect(stubs.finalizeChatLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        placeholderId: 'launch-r',
        configId: 'cfg-b',
        pending: expect.objectContaining({ modelId: 'glm-flash' })
      })
    )
    const leaf = useWorkspaceStore.getState().root as { tabs: { sessionId: string }[] }
    expect(leaf.tabs.map((t) => t.sessionId)).toEqual(['launch-r'])
    expect(stubs.deleteHistorySession).toHaveBeenCalledWith('s-empty')
    expect(stubs.armAgentSwitch).not.toHaveBeenCalled()
  })

  it('keeps a chat that started while the pick was read', async () => {
    useAcpStore.setState({
      sessions: {
        's-empty': { id: 's-empty', projectId: 'p1', cwd: '/work', status: 'active' }
      },
      messages: { 's-empty': [] }
    } as never)
    const stubs = stubLaunch()
    readComposerOptions.mockImplementation(async () => {
      useAcpStore.setState({ messages: { 's-empty': [{ id: 'm', role: 'user', blocks: [] }] } })
      return null
    })

    await replaceEmptyChat('s-empty', 'cfg-b', { modelId: 'glm-flash', modelConfigId: null })

    expect(stubs.createLaunchPlaceholder).not.toHaveBeenCalled()
    expect(stubs.deleteHistorySession).not.toHaveBeenCalled()
  })
})
