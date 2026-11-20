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
export async function addFolderAsProject(
  path: string,
  options: AddFolderOptions = {}
): Promise<FolderProjectResult> {
  const store = useProjectStore.getState()
  const key = normalizePath(path)
  const existing = store.projects.find((p) => p.path && normalizePath(p.path) === key)
  if (existing) {
    if (existing.isArchived) await store.restoreProject(existing.id)
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
