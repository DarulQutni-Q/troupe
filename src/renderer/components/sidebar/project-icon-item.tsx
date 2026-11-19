import type { GitDiffStat } from '@shared/types/ipc.types'
import { memo } from 'react'
import { GitBranch } from '@/components/icons'
import { ProjectIcon } from '@/components/ProjectIcon'
import { ProjectDiffStat } from '@/components/shell/ProjectDiffStat'
import {
  RailHoverPanel,
  RailHoverPanelContent,
  RailHoverPanelProjectRow,
  RailHoverPanelTrigger
} from '@/components/shell/rail/rail-hover-panel'
import { RAIL_COLLAPSED_ROW_CLASS } from '@/components/shell/rail/rail-motion'
import { RailWorktreeBranch } from '@/components/shell/rail/worktree-switcher'
import { RAIL_ICON_BOX_CLASS } from '@/components/shell/rail-layout'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { isContextMenuKey, openContextMenuFrom } from '@/lib/context-menu-key'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

export interface ProjectIconItemProps {
  project: Project
  isActive: boolean
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  renderContextMenu?: (project: Project) => React.ReactNode
  /** Shown in the hover card; nothing when null. */
  diffStat?: GitDiffStat | null
  /** A terminal crashed: a 6px destructive dot on the icon's corner. */
  crashed?: boolean
  /** A worktree is picked: a small branch mark on the icon's bottom-right corner. */
  worktree?: boolean
}

/**
 * Project row of the collapsed Rail (Sidebar V2): the expanded row's 30px
 * with only the 16px project icon, in a 30px square fill on the icon column,
 * so the icon keeps its expanded x (radius 8, hover 6% foreground).
 * Hover or keyboard focus opens the project card
 * (name + diff stat) at x = 60, on the row's y. Right-click opens the same
 * menu as the expanded row. A crashed terminal puts a red dot on the icon's
 * bottom-right corner, so a crash stays visible on the collapsed Rail.
 */
export const ProjectIconItem = memo(function ProjectIconItem({
  project,
  isActive,
  onClick,
  onContextMenu,
  renderContextMenu,
  diffStat = null,
  crashed = false,
  worktree = false
}: ProjectIconItemProps): React.JSX.Element {
  return (
    <div data-testid={`project-item-${project.id}`}>
      <ContextMenu>
        <RailHoverPanel>
          <RailHoverPanelTrigger asChild>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={onClick}
                onContextMenu={onContextMenu}
                onKeyDown={(e) => {
                  if (!isContextMenuKey(e)) return
                  e.preventDefault()
                  openContextMenuFrom(e.currentTarget)
                }}
                // Paper 1BU1: the open project is plain on the collapsed Rail too.
                className={cn(
                  'flex h-7.5 cursor-pointer select-none items-center rounded-lg',
                  RAIL_COLLAPSED_ROW_CLASS,
                  'transition-colors duration-150 ease-out hover:bg-foreground/[0.06] focus-visible:ring-inset',
                  FOCUS_RING_CLASS
                )}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Project: ${project.name}${isActive ? ' (active)' : ''}${crashed ? ', terminal crashed' : ''}`}
              >
                <span data-rail-icon-column className={cn(RAIL_ICON_BOX_CLASS, 'relative')}>
                  <ProjectIcon project={project} size={16} />
                  {worktree && (
                    <span
                      aria-hidden="true"
                      data-rail-project-worktree=""
                      className="absolute -right-1.5 -bottom-1.5 flex size-[11px] items-center justify-center rounded-full bg-muted text-foreground ring-[1.5px] ring-background"
                    >
                      <GitBranch size={7} strokeWidth={2.5} />
                    </span>
                  )}
                  {crashed && (
                    <span
                      aria-hidden="true"
                      data-rail-project-crashed=""
                      className={cn(
                        'absolute -right-0.5 size-1.5 rounded-full bg-destructive ring-[1.5px] ring-background',
                        // The branch mark holds the bottom corner.
                        worktree ? '-top-0.5' : '-bottom-0.5'
                      )}
                    />
                  )}
                </span>
              </button>
            </ContextMenuTrigger>
          </RailHoverPanelTrigger>
          <RailHoverPanelContent data-testid="rail-project-card">
            <RailHoverPanelProjectRow
              icon={<ProjectIcon project={project} size={16} />}
              name={project.name}
            >
              {worktree && <RailWorktreeBranch project={project} interactive={false} />}
              {diffStat && <ProjectDiffStat stat={diffStat} />}
              {crashed && <span className="text-2xs text-destructive">Terminal crashed</span>}
            </RailHoverPanelProjectRow>
          </RailHoverPanelContent>
        </RailHoverPanel>
        {renderContextMenu?.(project)}
      </ContextMenu>
    </div>
  )
})
