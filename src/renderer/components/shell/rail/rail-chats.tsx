import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react'
import { MoreHorizontal } from '@/components/icons'
import {
  CHAT_LIVE_STATE_WORD,
  type ProjectChatLiveState,
  RAIL_STATUS_DOT_CLASS
} from '@/components/sidebar/project-chat-row'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useRailCollapsed } from './rail-density'
import {
  RAIL_BLOCK_FADE_CLASS,
  RAIL_COLLAPSED_ROW_CLASS,
  RAIL_LABEL_FADE_CLASS,
  RAIL_NESTED_ICON_TRAVEL_CLASS,
  RAIL_NESTED_ROW_TRAVEL_CLASS
} from './rail-motion'

/**
 * Set by a nested {@link RailChatRow} for its content: its
 * {@link RailChatIcon} travels to the collapsed icon column with the row.
 */
const RailNestedRowContext = createContext(false)

/** Chats a Rail project shows before "Show N more". */
export const RAIL_CHAT_LIMIT = 5

/**
 * A row is on screen when the group is expanded, it is one of the first
 * {@link RAIL_CHAT_LIMIT} chats, or it is the pinned open chat.
 */
export function isRailChatRowShown(
  index: number,
  pinnedIndex: number | undefined,
  listExpanded: boolean
): boolean {
  return listExpanded || index < RAIL_CHAT_LIMIT || index === pinnedIndex
}

/**
 * Whether a project's Rail chat group has Show more open. The project row
 * reads it so a needs-you count drops a chat once its row is on screen.
 * The peek does not publish: it is a second copy of the list.
 */
const railChatListExpanded = new Map<string, boolean>()
const railChatListExpandedListeners = new Set<() => void>()

function publishRailChatListExpanded(key: string, expanded: boolean): void {
  if ((railChatListExpanded.get(key) === true) === expanded) return
  if (expanded) railChatListExpanded.set(key, true)
  else railChatListExpanded.delete(key)
  for (const listener of railChatListExpandedListeners) listener()
}

export function useRailChatListExpanded(key: string): boolean {
  return useSyncExternalStore(
    (listener) => {
      railChatListExpandedListeners.add(listener)
      return () => railChatListExpandedListeners.delete(listener)
    },
    () => railChatListExpanded.get(key) === true,
    () => false
  )
}

/**
 * A project's chat row starts its fill 22px in, so the fill runs x 30–240
 * on the Rail and the row reads as the project's child.
 */
const RAIL_NESTED_ROW_CLASS = 'ml-[22px] w-[calc(100%-22px)]'

interface RailChatGroupContextValue {
  /** Every chat of the group, shown or not. */
  total: number
  /** A row that stays visible past the limit (the open chat). */
  pinnedIndex: number | undefined
  expanded: boolean
  setExpanded: (expanded: boolean) => void
}

const RailChatGroupContext = createContext<RailChatGroupContextValue | null>(null)

function useRailChatGroup(part: string): RailChatGroupContextValue {
  const context = useContext(RailChatGroupContext)
  if (!context) throw new Error(`${part} must be used inside <RailChatGroup>`)
  return context
}

export interface RailChatGroupProps extends React.ComponentPropsWithoutRef<'div'> {
  /** Number of chats in the group. */
  total: number
  /**
   * Index of a row that stays visible while the group is collapsed, even past
   * the limit: the open chat must never hide behind "Show N more".
   */
  pinnedIndex?: number
  /**
   * Project id whose needs-you count should follow this group's Show more
   * state. Omit it on the peek.
   */
  expandedKey?: string
}

/**
 * Chats under a Rail project: 1px between rows, 4px below the
 * group. Owns the "Show N more" state that {@link RailChatItem} and
 * {@link RailShowMore} read. Compose it as
 * `RailChatGroup > RailChatList > RailChatItem > RailChatRow`, then `RailShowMore`.
 */
export const RailChatGroup = forwardRef<HTMLDivElement, RailChatGroupProps>(function RailChatGroup(
  { total, pinnedIndex, expandedKey, className, children, ...props },
  ref
) {
  const [expanded, setExpandedState] = useState(false)
  const setExpanded = useCallback(
    (next: boolean) => {
      setExpandedState(next)
      if (expandedKey) publishRailChatListExpanded(expandedKey, next)
    },
    [expandedKey]
  )
  useEffect(() => {
    if (!expandedKey) return
    return () => publishRailChatListExpanded(expandedKey, false)
  }, [expandedKey])
  const value = useMemo(
    () => ({ total, pinnedIndex, expanded, setExpanded }),
    [total, pinnedIndex, expanded, setExpanded]
  )
  return (
    <RailChatGroupContext.Provider value={value}>
      <div ref={ref} className={cn('flex flex-col gap-px pb-1', className)} {...props}>
        {children}
      </div>
    </RailChatGroupContext.Provider>
  )
})

/** The list element of a chat group. Give it an `aria-label`. */
export const RailChatList = forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  function RailChatList({ className, ...props }, ref) {
    return <ul ref={ref} className={cn('flex flex-col gap-px', className)} {...props} />
  }
)

export interface RailChatItemProps extends React.ComponentPropsWithoutRef<'li'> {
  /** Position in the group; rows past the limit render only when expanded. */
  index: number
}

/** One list item. Renders nothing past the limit while the group is collapsed. */
export const RailChatItem = forwardRef<HTMLLIElement, RailChatItemProps>(function RailChatItem(
  { index, ...props },
  ref
) {
  const { expanded, pinnedIndex } = useRailChatGroup('RailChatItem')
  if (!isRailChatRowShown(index, pinnedIndex, expanded)) return null
  return <li ref={ref} {...props} />
})

export interface RailChatRowProps extends React.ComponentPropsWithoutRef<'button'> {
  /** The chat is open in the active pane: keycap surface and `aria-current`. */
  open?: boolean
  /**
   * The row is a chat under a project: its fill starts 22px in (x 30 on the
   * Rail), so a hovered or open chat reads as the project's child and its
   * inner space matches a project row (12px left, 16px right). Quick chats
   * are top-level rows and keep the full width.
   */
  nested?: boolean
  /**
   * The row is the source of a drag in flight: 50% opacity and 98% scale, the
   * same feedback as a dragged workspace tab (no scale with reduced motion).
   */
  dragging?: boolean
}

/**
 * One chat row: 30px, 12px left, 16px right, 8px gaps. The right padding
 * puts a text trail's end on x 224 and an icon trail's centre on x 218, the
 * lane of the project rows' `+`. A `nested` row (a project's chat) starts its
 * fill 22px in; its 14px agent box sits at x 42 and the title at x 64.
 * Compose {@link RailChatIcon},
 * {@link RailChatTitle} and a trail (for example `ChatRowTrail`) inside.
 *
 * Collapsed Rail: the same 30px row with only the agent icon, in a 30px square
 * fill on the icon column (radius 8, hover 6% foreground). The open chat keeps
 * its keycap.
 *
 * Inside a {@link RailChatRowFrame}, the row keeps its hover fill while the
 * pointer is on the frame's More button and while its menu is open.
 *
 * To drag the row into a pane, pass `draggable` and the drag handlers, and
 * set `dragging` while the drag is in flight.
 */
export const RailChatRow = forwardRef<HTMLButtonElement, RailChatRowProps>(function RailChatRow(
  { open = false, nested = false, dragging = false, className, children, ...props },
  ref
) {
  const collapsed = useRailCollapsed()
  const travels = nested && !collapsed
  return (
    <button
      ref={ref}
      type="button"
      aria-current={open ? 'true' : undefined}
      data-open={open || undefined}
      data-dragging={dragging || undefined}
      className={cn(
        'flex h-7.5 min-w-0 items-center text-left text-xs whitespace-nowrap',
        collapsed
          ? cn(RAIL_COLLAPSED_ROW_CLASS, 'rounded-lg')
          : cn('gap-2 rounded-lg pr-4 pl-3', nested ? RAIL_NESTED_ROW_CLASS : 'w-full'),
        'transition-[color,background-color,opacity,scale] duration-150 ease-out focus-visible:ring-inset motion-reduce:transition-none',
        FOCUS_RING_CLASS,
        open
          ? 'keycap'
          : collapsed
            ? 'hover:bg-foreground/[0.06] group-data-[state=open]/rail-chat:bg-foreground/[0.06]'
            : 'hover:bg-row-hover group-hover/rail-chat:bg-row-hover group-data-[state=open]/rail-chat:bg-row-hover',
        dragging && 'scale-[0.98] opacity-50 motion-reduce:scale-100',
        // Expand/collapse: the fill and icon travel between x 30 and the
        // collapsed square at x 13, with the width (no jump at the switch).
        travels && RAIL_NESTED_ROW_TRAVEL_CLASS,
        className
      )}
      {...props}
    >
      <RailNestedRowContext.Provider value={travels}>{children}</RailNestedRowContext.Provider>
    </button>
  )
})

/**
 * Frame of one chat row with a menu: the row button and its More button are
 * siblings (no button inside a button). Use it as the context menu trigger,
 * so its `data-state` keeps the row filled while the menu is open.
 */
export const RailChatRowFrame = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function RailChatRowFrame({ className, ...props }, ref) {
    return <div ref={ref} className={cn('group/rail-chat relative', className)} {...props} />
  }
)

/**
 * The trail of a row with a More button: it gives way to the button while the
 * row is hovered, focused or has its menu open. The status stays in the row's
 * accessible name.
 */
export function RailChatTrailSlot({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center',
        RAIL_LABEL_FADE_CLASS,
        'group-hover/rail-chat:invisible group-focus-within/rail-chat:invisible group-data-[state=open]/rail-chat:invisible',
        className
      )}
      {...props}
    />
  )
}

/**
 * "…" at the end of a chat row (20px, 12px from the right, so its centre sits
 * on x 218 with the project rows' `+`). Shown on hover, focus or while the menu is open;
 * hidden on the collapsed Rail. A click opens the row's context menu at the
 * button.
 */
export const RailChatRowMore = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<'button'>, 'children'>
>(function RailChatRowMore({ className, ...props }, ref) {
  const collapsed = useRailCollapsed()
  if (collapsed) return null
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="menu"
      className={cn(
        'absolute top-1/2 right-3 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground',
        'opacity-0 group-hover/rail-chat:opacity-100 group-focus-within/rail-chat:opacity-100 group-data-[state=open]/rail-chat:opacity-100 focus-visible:opacity-100',
        'transition-[color,background-color,opacity] duration-150 ease-out hover:bg-foreground/[0.06] hover:text-foreground motion-reduce:transition-none',
        FOCUS_RING_CLASS,
        className
      )}
      {...props}
    >
      <MoreHorizontal size={12} aria-hidden="true" />
    </button>
  )
})

/**
 * 14px agent icon box at the start of a chat row: one 12px glyph in the
 * centre, or the stack of a multi-agent chat filling the box. Holds a
 * {@link RailChatStatusDot}.
 */
export function RailChatIcon({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element {
  const travels = useContext(RailNestedRowContext)
  return (
    <span
      aria-hidden="true"
      // 14px tall and at least 14px wide: a chat with 6+ agents adds "+N".
      className={cn(
        'relative inline-flex h-3.5 min-w-3.5 shrink-0 items-center justify-center',
        travels && RAIL_NESTED_ICON_TRAVEL_CLASS,
        className
      )}
      {...props}
    />
  )
}

/**
 * Status on the agent icon's bottom-right corner (collapsed Rail, where the
 * trail is hidden): a 6px dot — needs-you warning, finished-not-opened
 * primary — or an 8px spinner while a turn runs (a blue dot would read as
 * "finished"). Nothing when idle. A 1.5px ring in the Rail colour keeps it
 * apart from the glyph. Decorative: put the status in the row's accessible
 * name.
 */
export function RailChatStatusDot({
  state,
  className,
  ...props
}: Omit<React.ComponentPropsWithoutRef<'span'>, 'children'> & {
  state: ProjectChatLiveState
}): React.JSX.Element | null {
  if (state === 'running') {
    return (
      <span
        aria-hidden="true"
        data-rail-chat-status={state}
        className={cn(
          'absolute -right-1 -bottom-1 flex size-2.5 items-center justify-center rounded-full bg-background text-primary',
          className
        )}
        {...props}
      >
        <Spinner size={8} decorative />
      </span>
    )
  }
  const fill = RAIL_STATUS_DOT_CLASS[state]
  if (!fill) return null
  return (
    <span
      aria-hidden="true"
      data-rail-chat-status={state}
      className={cn(
        'absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-[1.5px] ring-background',
        fill,
        className
      )}
      {...props}
    />
  )
}

/**
 * Tooltip of a chat row on the expanded Rail (the collapsed Rail has the
 * peek). Hover swaps the row's status for "…", so the status can't carry its
 * own tooltip: this one names it — the title, then a dot and the status word,
 * or, for an idle chat, `detail` (who started it and when).
 */
export function RailChatTooltip({
  title,
  state,
  detail,
  children
}: {
  title: string
  state: ProjectChatLiveState
  detail?: string
  /** The row: one focusable element that accepts a ref. */
  children: React.ReactElement
}): React.JSX.Element {
  const collapsed = useRailCollapsed()
  if (collapsed) return children
  const word = CHAT_LIVE_STATE_WORD[state]
  const fill = state === 'running' ? 'bg-primary' : RAIL_STATUS_DOT_CLASS[state]
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="flex max-w-80 flex-col gap-0.5 px-2.5 py-1.5 text-xs">
        <span className="font-medium text-popover-foreground">{title}</span>
        {word ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {fill && <span aria-hidden="true" className={cn('size-1.5 rounded-full', fill)} />}
            {word}
          </span>
        ) : (
          detail && <span className="text-muted-foreground">{detail}</span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Chat title: fills the row and fades at its end instead of an ellipsis.
 * Not drawn on the collapsed Rail (the row's accessible name carries it).
 */
export function RailChatTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>): React.JSX.Element | null {
  const collapsed = useRailCollapsed()
  if (collapsed) return null
  return (
    <span
      className={cn(
        'fade-end min-w-0 flex-1 text-xs text-secondary-foreground',
        RAIL_LABEL_FADE_CLASS,
        className
      )}
      {...props}
    />
  )
}

/**
 * "Show N more" / "Show less" under a chat group: 30px, its text on the title
 * column, `muted-foreground` 12px. Nothing when every chat fits. `nested`
 * (a project's chats) insets the fill like {@link RailChatRow}.
 * Collapsed Rail: the same 30px row reads "···" (centred); its accessible
 * name keeps the words.
 */
export const RailShowMore = forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & { nested?: boolean }
>(function RailShowMore({ nested = false, className, onClick, ...props }, ref) {
  const { total, pinnedIndex, expanded, setExpanded } = useRailChatGroup('RailShowMore')
  const collapsed = useRailCollapsed()
  const pinnedPastLimit = pinnedIndex !== undefined && pinnedIndex >= RAIL_CHAT_LIMIT ? 1 : 0
  const hidden = total - RAIL_CHAT_LIMIT - pinnedPastLimit
  if (hidden <= 0 && !expanded) return null
  const words = expanded ? 'Show less' : `Show ${hidden} more`
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={expanded}
      onClick={(event) => {
        setExpanded(!expanded)
        onClick?.(event)
      }}
      aria-label={
        collapsed ? (expanded ? 'Show fewer chats' : `Show ${hidden} more chats`) : undefined
      }
      className={cn(
        // 30px like every Rail row, so the collapsed fill is the same square.
        'flex h-7.5 items-center text-xs text-muted-foreground',
        collapsed
          ? cn(RAIL_COLLAPSED_ROW_CLASS, 'rounded-lg hover:bg-foreground/[0.06]')
          : cn(
              'rounded-lg text-left whitespace-nowrap hover:bg-row-hover',
              nested ? cn(RAIL_NESTED_ROW_CLASS, 'pl-[34px]') : 'w-full pl-14'
            ),
        'transition-colors duration-150 ease-out hover:text-foreground focus-visible:ring-inset',
        FOCUS_RING_CLASS,
        className
      )}
      {...props}
    >
      {collapsed ? (
        <span aria-hidden="true" className={RAIL_BLOCK_FADE_CLASS}>
          ···
        </span>
      ) : (
        <span className={RAIL_LABEL_FADE_CLASS}>{words}</span>
      )}
    </button>
  )
})
