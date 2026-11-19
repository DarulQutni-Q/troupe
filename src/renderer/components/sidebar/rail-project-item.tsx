import { memo } from 'react'
import { useAgentChatProjectSignals } from '@/hooks/use-agent-chat-attention'
import { leaveQuickChatView } from '@/lib/no-project-chat'
import { useAgentChatLifetimeStore } from '@/stores/agent-chat-lifetime-store'
import { useProjectChatsHidden, useShellLayoutStore } from '@/stores/shell-layout-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useProjectDiffStat } from '../shell/ProjectDiffStat'
import {
  isRailChatRowShown,
  RAIL_CHAT_LIMIT,
  useRailChatListExpanded
} from '../shell/rail/rail-chats'
import { useRailCollapsed } from '../shell/rail/rail-density'
import {
  RailWorktreeBranch,
  RailWorktreeSwitcher,
  usePickedWorktree
} from '../shell/rail/worktree-switcher'
import { railChatsListId } from '../shell/rail-layout'
import { logRailEvent } from '../shell/shell-log'
import { useProjectChats, useProjectHasChats } from '../shell/use-project-chats'
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
 * Needs-you chats the open list does not draw. A row reads live state for
 * its own session only (`useChatLiveState`), so a folded chain member stays
 * in this count. Covered rows are the first {@link RAIL_CHAT_LIMIT}, the
 * open chat, and every chat once Show more is open. A picked worktree lists
 * only that copy, so a request in another copy stays on the project row.
 */
export function attentionOutsideRows(
  projectId: string,
  needsYouChats: ReadonlyMap<string, string>,
  cards: readonly { entry: { id: string; chainIds?: readonly string[] } }[],
  openChatId: string | null = null,
  listExpanded = false
): { count: number; sessionId: string | undefined } {
  const pinnedIndex = cards.findIndex(
    (card) =>
      openChatId !== null &&
      (card.entry.id === openChatId || (card.entry.chainIds?.includes(openChatId) ?? false))
  )
  const covered = new Set<string>()
  cards.forEach((card, index) => {
    if (!isRailChatRowShown(index, pinnedIndex === -1 ? undefined : pinnedIndex, listExpanded)) {
      return
    }
    covered.add(card.entry.id)
  })
  let count = 0
  let sessionId: string | undefined
  for (const [id, owner] of needsYouChats) {
    if (owner !== projectId || covered.has(id)) continue
    count += 1
    sessionId ??= id
  }
  return { count, sessionId }
}

/**
 * Opens a needs-you chat the list does not show. Same path as
 * `useProjectRail`: the active project gets a tab; another project focuses
 * the chat, then opens.
 */
function openOutsideNeedsYou(
  projectId: string,
  sessionId: string,
  isActive: boolean,
  openProject: () => void
): void {
  logRailEvent(`open needs-you ${sessionId} outside visible chats`)
  if (isActive) {
    leaveQuickChatView('project-rail.needs-you')
    useWorkspaceStore.getState().addAgentChatTab(sessionId)
    return
  }
  useAgentChatLifetimeStore.getState().requestFocus(projectId, sessionId)
  openProject()
}

/**
 * A project's row with the chevron that collapses or expands its chat list
 * (only when it has chats). Every project keeps its own collapse state, so a
 * project switch leaves each list as the user left it. A click on the open
 * project's row also toggles it; a click on another project's row only opens
 * that project. While the chats show, each visible row carries its own
 * needs-you dot. The row count then keeps only requests those rows do not
 * show. A hidden list keeps the full project count.
 */
function ChatsToggleRailProjectItem(props: ProjectItemProps): React.JSX.Element {
  const { project, onClick, isActive, status, onOpenNeedsYou } = props
  const hasChats = useProjectHasChats(project)
  const hidden = useProjectChatsHidden(project.id)
  const { cards, openChatId } = useProjectChats(project)
  const listExpanded = useRailChatListExpanded(project.id)
  const needsYouChats = useAgentChatProjectSignals().needsYouChats
  if (!hasChats) return <ProjectItem {...props} />
  const toggle = (): void => {
    logRailEvent(`${hidden ? 'expand' : 'collapse'} chats ${project.id}`)
    useShellLayoutStore.getState().setProjectChatsHidden(project.id, !hidden)
  }
  const outside = hidden
    ? null
    : attentionOutsideRows(project.id, needsYouChats, cards, openChatId, listExpanded)
  const outsideSessionId = outside?.sessionId
  return (
    <ProjectItem
      {...props}
      status={outside === null ? status : { ...status, attentionCount: outside.count }}
      chatsExpanded={!hidden}
      chatsListId={railChatsListId(project.id)}
      onToggleChats={toggle}
      onOpenNeedsYou={
        outsideSessionId
          ? () => openOutsideNeedsYou(project.id, outsideSessionId, isActive, onClick)
          : onOpenNeedsYou
      }
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
