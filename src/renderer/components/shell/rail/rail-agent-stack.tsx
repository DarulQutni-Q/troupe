import { useMemo } from 'react'
import { AgentGlyph } from '@/components/chat/AgentGlyph'
import { ChatEntryIcon } from '@/components/chat/ChatHistoryEntryRow'
import { cn } from '@/lib/utils'
import { useAgentIcon, useAgentTemplateId } from '@/stores/acp-store'
import { useRailCollapsed } from './rail-density'

/** One glyph of a stack: its top-left corner in the 14px box, in px. */
type Slot = readonly [x: number, y: number]

/**
 * Glyph size and slots per agent count, inside the 14×14 box (Paper S1.3 B,
 * approved at 14px). Later slots sit in front of earlier ones.
 */
const STACK_LAYOUT: Record<2 | 3 | 4 | 5, { size: number; slots: readonly Slot[] }> = {
  2: {
    size: 9,
    slots: [
      [0, 0],
      [5, 5]
    ]
  },
  3: {
    size: 8,
    slots: [
      [0, 0],
      [6, 0],
      [3, 6]
    ]
  },
  4: {
    size: 7,
    slots: [
      [0, 0],
      [7, 0],
      [0, 7],
      [7, 7]
    ]
  },
  5: {
    size: 7,
    slots: [
      [0, 0],
      [7, 0],
      [0, 7],
      [7, 7],
      [3.5, 3.5]
    ]
  }
}

/** More agents than this show the 4-stack plus "+N". */
const STACK_MAX = 5

/**
 * The cutout behind a glyph that sits in front of another: the row's own
 * surface, so the glyph behind reads as passing under it. Rest = the Rail
 * background, hover = the flattened row-hover wash, open = the keycap fill.
 */
const CUTOUT_CLASS =
  'bg-background group-hover/rail-chat:bg-row-hover-solid [[data-open]_&]:bg-[var(--keycap-fill)]'

/** Consecutive duplicates collapse (a → a → b is two agents); order is kept. */
export function stackAgentIds(agents: readonly string[] | undefined): string[] {
  const ids: string[] = []
  for (const id of agents ?? []) {
    if (ids[ids.length - 1] !== id) ids.push(id)
  }
  return ids
}

/** One agent glyph at its slot; resolves its icon through `AgentGlyph`. */
function StackGlyph({
  agentConfigId,
  size,
  slot
}: {
  agentConfigId: string
  size: number
  slot: Slot
}): React.JSX.Element {
  const templateId = useAgentTemplateId(null, agentConfigId)
  const icon = useAgentIcon(null, agentConfigId)
  return (
    <span
      className="absolute flex"
      style={{ left: slot[0], top: slot[1], width: size, height: size }}
    >
      <AgentGlyph
        templateId={templateId}
        icon={icon}
        size={size}
        className="text-muted-foreground"
      />
    </span>
  )
}

/**
 * The agents of a multi-agent chat stacked inside the 14×14 icon box, so the
 * title keeps its x for every chat: 2 agents as 9px glyphs on the diagonal, 3
 * as 8px in a triangle, 4 as a 7px 2×2, 5 as the 2×2 plus one in the centre.
 * Each glyph in front gets a cutout in the row's surface. 6 or more show the
 * first four and a "+N" after the box — not on the collapsed Rail, whose 30px
 * square has no room for it (the peek and the accessible name keep the
 * count). The first agent is the chat's original.
 */
export function RailAgentStack({ ids }: { ids: readonly string[] }): React.JSX.Element {
  const collapsed = useRailCollapsed()
  const shown = ids.length > STACK_MAX ? ids.slice(0, 4) : ids
  const overflow = collapsed ? 0 : ids.length - shown.length
  const layout = STACK_LAYOUT[Math.min(Math.max(shown.length, 2), 5) as 2 | 3 | 4 | 5]
  return (
    <span
      role="img"
      aria-label={`Conversation agents, ${ids.length} total`}
      data-rail-agent-stack={ids.length}
      className="inline-flex shrink-0 items-center gap-0.5"
    >
      <span className="relative block size-3.5 shrink-0">
        {shown.map((id, index) => {
          const slot = layout.slots[index]
          return (
            // Keyed by id and position: a chain may repeat an agent (a → b → a).
            <span key={`${id}-${index}`}>
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn('absolute rounded-full', CUTOUT_CLASS)}
                  style={{
                    left: slot[0] - 1,
                    top: slot[1] - 1,
                    width: layout.size + 2,
                    height: layout.size + 2
                  }}
                />
              )}
              <StackGlyph agentConfigId={id} size={layout.size} slot={slot} />
            </span>
          )
        })}
      </span>
      {overflow > 0 && (
        // Fades with the titles while the Rail collapses (opacity only: the
        // box keeps its x, so the stack does not move).
        <span className="text-3xs leading-none tabular-nums text-muted-foreground transition-opacity duration-150 ease-out group-data-[rail-motion=collapsing]/rail:opacity-0 motion-reduce:transition-none">
          +{overflow}
        </span>
      )}
    </span>
  )
}

/**
 * The Rail chat row's agent icon: one 12px glyph centred in the 14px box, or
 * {@link RailAgentStack} when the chat ran with two or more agents.
 */
export function RailChatAgents({
  agentId,
  agentConfigId,
  agents
}: {
  agentId?: string
  agentConfigId?: string
  agents?: string[]
}): React.JSX.Element {
  const ids = useMemo(() => stackAgentIds(agents), [agents])
  if (ids.length >= 2) return <RailAgentStack ids={ids} />
  return <ChatEntryIcon agentId={agentId} agentConfigId={agentConfigId} />
}
