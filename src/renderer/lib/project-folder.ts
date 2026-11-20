import { dialogApi } from '@/lib/api'
import { normalizePath } from '@/lib/working-copy'
import { reconcileProjectWorktrees } from '@/lib/worktree-reconciler'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { useProjectStore } from '@/stores/project-store'
import type { EnvVariable, Project, ProjectColor } from '@/types/project'

export type FolderProjectResult =
  | { kind: 'added'; project: Project }
  /** The registry does not dedupe by path: a project with this folder already existed. */
  | { kind: 'existing'; project: Project }
  /** The folder's project is archived and the host refused to restore it; the user has been told. */
  | { kind: 'restore-failed' }

export interface AddFolderOptions {
  name?: string
  color?: ProjectColor
  defaultShell?: string
  envVars?: EnvVariable[]
}

/**
 * The selected project for a folder. Reuses (and restores, when archived) a
 * project with the same path instead of adding a duplicate; otherwise
 * registers one in the user's default color and starts git detection.
 * Throws when registration fails.
 */
const inFlight = new Map<string, Promise<FolderProjectResult>>()

export function addFolderAsProject(
  path: string,
  options: AddFolderOptions = {}
): Promise<FolderProjectResult> {
  // Two calls for one folder before the projects watch lists the first would
  // each register it; the second joins the first instead.
  const key = normalizePath(path)
  const running = inFlight.get(key)
  if (running) return running
  const run = registerFolder(path, key, options).finally(() => inFlight.delete(key))
  inFlight.set(key, run)
  return run
}

async function registerFolder(
  path: string,
  key: string,
  options: AddFolderOptions
): Promise<FolderProjectResult> {
  const store = useProjectStore.getState()
  const existing = store.projects.find((p) => p.path && normalizePath(p.path) === key)
  if (existing) {
    if (existing.isArchived && !(await store.restoreProject(existing.id))) {
      return { kind: 'restore-failed' }
    }
    store.selectProject(existing.id)
    return { kind: 'existing', project: existing }
  }
  const name = options.name ?? (path.split(/[\\/]/).filter(Boolean).pop() || 'New Project')
  const color =
    options.color ??
    ((useAppSettingsStore.getState().settings.defaultProjectColor as ProjectColor) || 'blue')
  const project = await store.addProject(name, color, path, options.defaultShell, options.envVars)
  void reconcileProjectWorktrees(project.id)
  return { kind: 'added', project }
}

/**
 * Opens the folder picker (the native dialog on desktop, the in-app picker on
 * the web) and makes the pick the selected project. Throws on a picker error
 * other than a cancel, and when registration fails.
 */
export async function pickFolderAsProject(): Promise<{ kind: 'cancelled' } | FolderProjectResult> {
  const picked = await dialogApi.selectDirectory()
  if (!picked.success) {
    if (picked.code === 'CANCELLED') return { kind: 'cancelled' }
    throw new Error(picked.error)
  }
  return addFolderAsProject(picked.data)
}
