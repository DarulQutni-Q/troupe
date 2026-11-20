import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Folder, FolderOpen, FolderPlus, GitBranch } from '@/components/icons'
import { NewProjectModal } from '@/components/NewProjectModal'
import { SettingsCard } from '@/components/settings/SettingsGroup'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { logFrontendError } from '@/lib/log-api'
import { addFolderAsProject, pickFolderAsProject } from '@/lib/project-folder'
import { cn } from '@/lib/utils'
import { selectGitBranch, useGitStatusStore } from '@/stores/git-status-store'
import { useProjectStore } from '@/stores/project-store'
import { StepFrame, TOUCH_TARGET_CLASS } from './OnboardingFrame'

export interface ProjectStepProps {
  /** The registered project picked so far; the shell keeps it across Back. */
  projectId: string | null
  onPicked: (projectId: string | null) => void
  onBack: () => void
  /** With no agent chosen, skipping lands on the empty workspace instead of a quick chat. */
  hasAgent: boolean
  /** Landing runs: the footer is disabled so it runs once. */
  landing: boolean
  /** null: "Skip". */
  onFinish: (projectId: string | null) => void
}

const CHOICE_CLASS = cn(
  'flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors duration-150 ease-out hover:bg-foreground/[0.03] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60',
  TOUCH_TARGET_CLASS
)

function log(level: 'info' | 'warn', message: string): void {
  void logFrontendError({ level, source: 'onboarding', message })
}

function PickedProject({
  projectId,
  onChange
}: {
  projectId: string
  onChange: () => void
}): React.JSX.Element | null {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const path = project?.path
  const branch = useGitStatusStore(selectGitBranch(path))
  useEffect(() => {
    if (path) void useGitStatusStore.getState().fetchCommitContext(path)
  }, [path])
  if (!project) return null
  return (
    <SettingsCard>
      <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Folder size={16} className="text-foreground/80" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium leading-4 text-foreground">{project.name}</div>
          <div className="flex items-center gap-2 text-2xs leading-4 text-muted-foreground">
            <span className="truncate font-mono">{path}</span>
            {branch && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <GitBranch size={12} />
                {branch}
              </span>
            )}
          </div>
        </div>
        <Button size="xs" variant="ghost" className={TOUCH_TARGET_CLASS} onClick={onChange}>
          Change
        </Button>
      </div>
    </SettingsCard>
  )
}

export function ProjectStep({
  projectId,
  onPicked,
  onBack,
  hasAgent,
  landing,
  onFinish
}: ProjectStepProps): React.JSX.Element {
  const [opening, setOpening] = useState(false)
  const [creating, setCreating] = useState(false)
  const picked = useProjectStore((s) =>
    projectId ? s.projects.some((p) => p.id === projectId) : false
  )

  const openFolder = async (): Promise<void> => {
    setOpening(true)
    try {
      const result = await pickFolderAsProject()
      if (result.kind === 'cancelled') return
      log('info', `Project picked (${result.kind})`)
      onPicked(result.project.id)
    } catch (err) {
      log('warn', 'Opening a folder as a project failed')
      toast.error('Could not open the folder', {
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <StepFrame
      step="project"
      title="Where should agents work?"
      body="Pick a folder. Agents read and change files only inside it, and every chat shows what changed."
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            className={TOUCH_TARGET_CLASS}
            disabled={landing}
            onClick={onBack}
          >
            <ArrowLeft size={14} className="mr-1.5" />
            Back
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className={TOUCH_TARGET_CLASS}
              disabled={landing}
              onClick={() => onFinish(null)}
            >
              {hasAgent ? 'Skip, chat without a project' : 'Skip for now'}
            </Button>
            <Button
              size="sm"
              className={TOUCH_TARGET_CLASS}
              disabled={!picked || landing}
              onClick={() => projectId && onFinish(projectId)}
            >
              Continue
            </Button>
          </div>
        </>
      }
    >
      {picked && projectId ? (
        <PickedProject projectId={projectId} onChange={() => onPicked(null)} />
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={CHOICE_CLASS}
            disabled={opening}
            onClick={() => void openFolder()}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
              {opening ? (
                <Spinner size={16} decorative />
              ) : (
                <FolderOpen size={16} className="text-foreground/80" />
              )}
            </span>
            <span>
              <span className="block text-xs font-medium leading-4 text-foreground">
                Open a folder
              </span>
              <span className="block text-xs leading-4 text-muted-foreground">
                A project already on this computer
              </span>
            </span>
          </button>
          <button
            type="button"
            className={CHOICE_CLASS}
            disabled={opening}
            onClick={() => setCreating(true)}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
              <FolderPlus size={16} className="text-foreground/80" />
            </span>
            <span>
              <span className="block text-xs font-medium leading-4 text-foreground">
                Create a new project
              </span>
              <span className="block text-xs leading-4 text-muted-foreground">
                An empty folder or a template, with Git
              </span>
            </span>
          </button>
        </div>
      )}
      <NewProjectModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onCreateProject={async (name, color, path, defaultShell, envVars) => {
          // The modal closes before its work finishes, so the pick is taken here.
          const result = await addFolderAsProject(path ?? '', {
            name,
            color,
            defaultShell,
            envVars
          })
          log('info', `Project created (${result.kind})`)
          onPicked(result.project.id)
          return result.project
        }}
      />
    </StepFrame>
  )
}
