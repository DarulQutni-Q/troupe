import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from '@/components/icons'
import { FOCUS_RING_CLASS } from '@/components/ui/panel-styles'
import { useUpdatePanelVisibility } from '@/hooks/use-app-settings'
import { cn } from '@/lib/utils'

/**
 * Start of the Rail's SSH section header: one toggle with the chevron, the
 * `SSH` label and the host count, the same shape as the Rail's "Older chats"
 * header (the chevron starts on x 20, in line with the row icons). Toggles
 * the persisted `sshPanelVisible`, with an error toast when saving fails.
 */
export function SSHSectionChevron({
  expanded,
  count = 0
}: {
  expanded: boolean
  /** Hosts in the section; shown after the label when there are any. */
  count?: number
}): React.JSX.Element {
  const updatePanelVisibility = useUpdatePanelVisibility()

  const handleToggle = async (): Promise<void> => {
    try {
      await updatePanelVisibility('sshPanelVisible', !expanded)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update SSH panel visibility')
    }
  }

  const label = expanded ? 'Collapse SSH section' : 'Expand SSH section'

  return (
    <button
      type="button"
      onClick={() => void handleToggle()}
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground',
        FOCUS_RING_CLASS
      )}
      aria-label={label}
      aria-expanded={expanded}
    >
      {expanded ? (
        <ChevronDown size={14} aria-hidden="true" />
      ) : (
        <ChevronRight size={14} aria-hidden="true" />
      )}
      <span className="label-panel">SSH</span>
      {count > 0 && (
        <span className="text-2xs tabular-nums text-muted-foreground" data-testid="ssh-host-count">
          {count}
        </span>
      )}
    </button>
  )
}
