import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types/project'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'
import { addFolderAsProject, pickFolderAsProject } from './project-folder'

const { mockSelectDirectory, mockReconcile } = vi.hoisted(() => ({
  mockSelectDirectory: vi.fn(),
  mockReconcile: vi.fn()
}))

vi.mock('@/lib/api', () => ({ dialogApi: { selectDirectory: mockSelectDirectory } }))
vi.mock('@/lib/worktree-reconciler', () => ({ reconcileProjectWorktrees: mockReconcile }))

const addProject = vi.fn()
const selectProject = vi.fn()
const restoreProject = vi.fn()

const app: Project = { id: 'p-app', name: 'my-app', color: 'green', path: '/home/u/code/my-app' }

beforeEach(() => {
  vi.clearAllMocks()
  addProject.mockImplementation(async (name: string, color: string, path: string) => ({
    id: 'p-new',
    name,
    color,
    path
  }))
  restoreProject.mockResolvedValue(true)
  useProjectStore.setState({ projects: [app], addProject, selectProject, restoreProject })
  useAppSettingsStore.setState({
    settings: { ...DEFAULT_APP_SETTINGS, defaultProjectColor: 'purple' }
  })
})

describe('addFolderAsProject', () => {
  it('joins a registration of the same folder that is still running', async () => {
    let finish: (project: Project) => void = () => {}
    addProject.mockImplementationOnce(() => new Promise<Project>((resolve) => (finish = resolve)))

    const first = addFolderAsProject('/home/u/code/new-app')
    const second = addFolderAsProject('/home/u/code/new-app/')
    finish({ id: 'p-new', name: 'new-app', color: 'purple', path: '/home/u/code/new-app' })

    expect(await second).toEqual(await first)
    expect(addProject).toHaveBeenCalledTimes(1)
  })

  it('stops when the host refuses to restore the archived project', async () => {
    useProjectStore.setState({ projects: [{ ...app, isArchived: true }] })
    restoreProject.mockResolvedValueOnce(false)

    const result = await addFolderAsProject('/home/u/code/my-app')

    expect(result).toEqual({ kind: 'restore-failed' })
    expect(selectProject).not.toHaveBeenCalled()
  })

  it('registers a new folder in the default project color and starts git detection', async () => {
    const result = await addFolderAsProject('/home/u/code/new-app/')

    expect(result).toEqual({
      kind: 'added',
      project: { id: 'p-new', name: 'new-app', color: 'purple', path: '/home/u/code/new-app/' }
    })
    expect(addProject).toHaveBeenCalledWith(
      'new-app',
      'purple',
      '/home/u/code/new-app/',
      undefined,
      undefined
    )
    expect(mockReconcile).toHaveBeenCalledWith('p-new')
  })

  it('reuses and selects the project that already has the same folder', async () => {
    const result = await addFolderAsProject('/home/u/code/./my-app/')

    expect(result).toEqual({ kind: 'existing', project: app })
    expect(addProject).not.toHaveBeenCalled()
    expect(restoreProject).not.toHaveBeenCalled()
    expect(selectProject).toHaveBeenCalledWith('p-app')
  })

  it('restores an archived project with the same folder', async () => {
    useProjectStore.setState({ projects: [{ ...app, isArchived: true }] })

    const result = await addFolderAsProject('/home/u/code/my-app')

    expect(result.kind).toBe('existing')
    expect(restoreProject).toHaveBeenCalledWith('p-app')
    expect(selectProject).toHaveBeenCalledWith('p-app')
  })

  it('passes the name, color, shell and env a create form chose', async () => {
    await addFolderAsProject('/home/u/code/site', {
      name: 'Site',
      color: 'red',
      defaultShell: 'zsh',
      envVars: [{ key: 'A', value: '1' }]
    })

    expect(addProject).toHaveBeenCalledWith('Site', 'red', '/home/u/code/site', 'zsh', [
      { key: 'A', value: '1' }
    ])
  })
})

describe('pickFolderAsProject', () => {
  it('returns cancelled when the picker is closed', async () => {
    mockSelectDirectory.mockResolvedValue({ success: false, code: 'CANCELLED', error: 'none' })

    expect(await pickFolderAsProject()).toEqual({ kind: 'cancelled' })
    expect(addProject).not.toHaveBeenCalled()
  })

  it('throws the picker error for anything but a cancel', async () => {
    mockSelectDirectory.mockResolvedValue({
      success: false,
      code: 'DIALOG_ERROR',
      error: 'portal unavailable'
    })

    await expect(pickFolderAsProject()).rejects.toThrow('portal unavailable')
  })

  it('adds the picked folder', async () => {
    mockSelectDirectory.mockResolvedValue({ success: true, data: '/home/u/code/api' })

    expect(await pickFolderAsProject()).toEqual({
      kind: 'added',
      project: { id: 'p-new', name: 'api', color: 'purple', path: '/home/u/code/api' }
    })
  })
})
