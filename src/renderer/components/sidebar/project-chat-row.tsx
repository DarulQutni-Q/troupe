import type { ChatHistorySidebarEntry } from '@/components/chat/ChatHistoryEntryRow'
import { Spinner } from '@/components/ui/spinner'
import { formatRailRelativeTime, formatRelativeTimeFromMs } from '@/lib/relative-time'

export type ProjectChatEntry = ChatHistorySidebarEntry

/**
 * Live state of one chat row: a turn is in progress, the chat waits on you, or
 * neither. `done` means a turn finished and the user has not opened the chat
 * since (the `unread` signal).
 */
export type ProjectChatLiveState = 'running' | 'needs-you' | 'done' | 'idle'

/**
 * Accessible and tooltip wording per live state; idle has none (the row shows
 * its time). `done` is a finished turn the user has not opened yet.
 */
export const CHAT_LIVE_STATE_WORD: Record<ProjectChatLiveState, string | null> = {
  'needs-you': 'Needs you',
  running: 'Running',
  done: 'Finished · not opened yet',
  idle: null
}

/** Fill of a Rail status dot per live state; running is a spinner, idle has none. */
export const RAIL_STATUS_DOT_CLASS: Record<ProjectChatLiveState, string | null> = {
  'needs-you': 'bg-warning',
  running: null,
  done: 'bg-primary',
  idle: null
}

/**
 * A 6px status dot in a 12px slot, so it sits on the same lane as the running
 * spinner. Decorative: the row's accessible name and tooltip say the status.
 */
export function RailStatusDot({
  fillClass,
  state
}: {
  fillClass: string
  state: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-rail-status-dot={state}
      className="flex size-3 shrink-0 items-center justify-center"
    >
      <span className={`size-1.5 rounded-full ${fillClass}`} />
    </span>
  )
}

/**
 * Right slot of a chat row.
 *
 * - `rail` (desktop Rail): one 12px status on the right lane — amber dot
 *   (needs you), blue spinner (running), blue dot (finished, not opened yet) —
 *   or the short time ("3h", "2mo", "1y"). No "Closed ·" prefix.
 * - `default` (phone drawer): running spinner, needs-you pill, "New" mark, or
 *   the relative time ("Closed · 2d" for a closed chat).
 */
export function ChatRowTrail({
  liveState,
  lastActivityAt,
  closed = false,
  variant = 'default'
}: {
  liveState: ProjectChatLiveState
  lastActivityAt: number
  /** The chat is closed: the default idle time reads "Closed · <time>". */
  closed?: boolean
  variant?: 'default' | 'rail'
}): React.JSX.Element {
  if (variant === 'rail') {
    if (liveState === 'running') {
      return (
        <span className="flex shrink-0 items-center text-primary">
          <Spinner size={12} label="Running" />
        </span>
      )
    }
    const fill = RAIL_STATUS_DOT_CLASS[liveState]
    if (fill) return <RailStatusDot fillClass={fill} state={liveState} />
    return (
      <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
        {formatRailRelativeTime(lastActivityAt)}
      </span>
    )
  }
  switch (liveState) {
    case 'running':
      return (
        <span className="flex shrink-0 items-center text-primary">
          <Spinner size={12} label="Running" />
        </span>
      )
    case 'needs-you':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-warning/10 px-1.5 text-3xs font-medium text-warning">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          Needs you
        </span>
      )
    case 'done':
      return (
        <span
          className="flex shrink-0 items-center gap-1 text-2xs font-medium text-foreground"
          title="New activity"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" />
          New
        </span>
      )
    case 'idle': {
      const time = formatRelativeTimeFromMs(lastActivityAt)
      return (
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
          {closed ? `Closed · ${time}` : time}
        </span>
      )
    }
  }
}
