import { memo } from 'react'
import { useProjectChatsHidden, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useProjectDiffStat } from '../shell/ProjectDiffStat'
import { useRailCollapsed } from '../shell/rail/rail-density'
import {
  RailWorktreeBranch,
  RailWorktreeSwitcher,
  usePickedWorktree
} from '../shell/rail/worktree-switcher'
import { railChatsListId } from '../shell/rail-layout'
import { logRailEvent } from '../shell/shell-log'
import { useProjectHasChats } from '../shell/use-project-chats'
import { ProjectIconItem } from './project-icon-item'
import { ProjectItem, type ProjectItemProps } from './project-item'

/**
 * Project row of the shell Rail. The expanded row shows no diff stat (the
 * Changes panel has it); the collapsed Rail's icon-only row keeps it on its
 * hover card, so the row watches its working copy only while collapsed. A
 * picked worktree shows inline after the name (a mark on the icon when
 * collapsed); the row anchors the worktree switcher.
 */
export const RailProjectItem = memo(function RailProjectItem(
  props: Omit<ProjectItemProps, 'diffStat' | 'worktree'>
): React.JSX.Element {
  const collapsed = useRailCollapsed()
  const diffStat = useProjectDiffStat(props.project, collapsed)
  const picked = usePickedWorktree(props.project)
  return (
    <RailWorktreeSwitcher project={props.project} side={collapsed ? 'right' : 'bottom'}>
      {collapsed ? (
        <ProjectIconItem
          project={props.project}
          isActive={props.isActive}
          crashed={props.status.crashed}
          worktree={Boolean(picked)}
          onClick={props.onClick}
          onContextMenu={props.onContextMenu}
          renderContextMenu={props.renderContextMenu}
          diffStat={diffStat}
        />
      ) : (
        <ChatsToggleRailProjectItem
          {...props}
          worktree={picked ? <RailWorktreeBranch project={props.project} /> : undefined}
        />
      )}
    </RailWorktreeSwitcher>
  )
})

/**
 * A project's row with the chevron that collapses or expands its chat list
 * (only when it has chats). Every project keeps its own collapse state, so a
 * project switch leaves each list as the user left it. A click on the open
 * project's row also toggles it; a click on another project's row only opens
 * that project. While the chats show, each chat row carries its own
 * needs-you dot, so the row's needs-you count shows only when they are hidden.
 */
function ChatsToggleRailProjectItem(props: ProjectItemProps): React.JSX.Element {
  const { project, onClick, isActive, status } = props
  const hasChats = useProjectHasChats(project)
  const hidden = useProjectChatsHidden(project.id)
  if (!hasChats) return <ProjectItem {...props} />
  const toggle = (): void => {
    logRailEvent(`${hidden ? 'expand' : 'collapse'} chats ${project.id}`)
    useShellLayoutStore.getState().setProjectChatsHidden(project.id, !hidden)
  }
  return (
    <ProjectItem
      {...props}
      status={hidden ? status : { ...status, attentionCount: 0 }}
      chatsExpanded={!hidden}
      chatsListId={railChatsListId(project.id)}
      onToggleChats={toggle}
      onClick={
        isActive
          ? () => {
              toggle()
              onClick()
            }
          : onClick
      }
    />
  )
}
