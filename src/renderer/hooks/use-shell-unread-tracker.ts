import { useEffect, useLayoutEffect, useMemo } from 'react'
import { useShallow } from 'zustand/shallow'
import { useChatReadMarker } from '@/hooks/use-chat-read-marker'
import { resolveMobileActiveLeaf } from '@/hooks/use-mobile-active-leaf'
import { useMobileWebShell } from '@/hooks/use-mobile-web-shell'
import { startChatActivitySync } from '@/lib/chat-activity-sync'
import { useChatActivityStore } from '@/stores/chat-activity-store'
import { useQuickChatSessionId } from '@/stores/quick-chat-store'
import {
  findPaneById,
  getAllLeafPanes,
  useWorkspaceStore,
  type WorkspaceState
} from '@/stores/workspace-store'
import type { LeafNode } from '@/types/workspace.types'

function activeChatSessionId(leaf: LeafNode): string | null {
  const tab = leaf.tabs.find((t) => t.id === leaf.activeTabId)
  return tab?.type === 'agent-chat' ? tab.sessionId : null
}

/**
 * Session ids of the agent chats currently shown, by the rule the pane tree
 * renders with (`ProjectTreeHost`): only the mobile active leaf's on the
 * mobile web shell, else only a fullscreen pane's, else every leaf's active
 * tab when it is an agent chat.
 */
export function activeChatSessionIds(
  tree: Pick<WorkspaceState, 'root' | 'activePaneId' | 'fullscreenPaneId'>,
  mobile: boolean
): string[] {
  const ids: string[] = []
  for (const leaf of renderedLeaves(tree, mobile)) {
    const id = activeChatSessionId(leaf)
    if (id) ids.push(id)
  }
  return ids
}

function renderedLeaves(
  {
    root,
    activePaneId,
    fullscreenPaneId
  }: Pick<WorkspaceState, 'root' | 'activePaneId' | 'fullscreenPaneId'>,
  mobile: boolean
): LeafNode[] {
  if (mobile) {
    const { leaf } = resolveMobileActiveLeaf(root, activePaneId)
    return leaf ? [leaf] : []
  }
  const fullscreen = fullscreenPaneId ? findPaneById(root, fullscreenPaneId) : null
  return fullscreen?.type === 'leaf' ? [fullscreen] : getAllLeafPanes(root)
}

/**
 * The chats on screen: an open quick chat covers the pane tree, so it is the
 * only one. Otherwise the panes' active chats.
 */
export function viewingSessionIds(
  quickSessionId: string | null,
  paneSessionIds: string[]
): string[] {
  return quickSessionId ? [quickSessionId] : paneSessionIds
}

/**
 * The one per-renderer mount of the host's chat activity: it mirrors the
 * `chat_activity` watch every chat list reads, tells the store which chats this
 * renderer shows (their "New activity" dot stays hidden here; an open quick
 * chat is the only one shown), and reports
 * those chats read so the dot clears on every surface. Called from
 * `WorkspaceLayout`, which serves both `TauriApp.tsx` and `App.tsx`.
 */
export function useShellUnreadTracker(): void {
  const mobile = useMobileWebShell()
  const paneSessionIds = useWorkspaceStore(
    useShallow((state) => activeChatSessionIds(state, mobile))
  )
  const quickSessionId = useQuickChatSessionId()
  const activeSessionIds = useMemo(
    () => viewingSessionIds(quickSessionId, paneSessionIds),
    [quickSessionId, paneSessionIds]
  )
  useEffect(() => startChatActivitySync(), [])
  const activeKey = activeSessionIds.join('\u0000')
  // Before paint: a chat switched to must not show its own dot for a frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey is the stable identity of activeSessionIds
  useLayoutEffect(() => {
    useChatActivityStore.getState().setViewing(activeSessionIds)
  }, [activeKey])
  useChatReadMarker(activeSessionIds)
}
