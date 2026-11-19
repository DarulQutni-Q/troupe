import type { SSHProfile } from '@shared/types/ssh.types'
import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  Copy,
  Download,
  Edit,
  MoreHorizontal,
  Pin,
  Plus,
  Server,
  Terminal,
  Trash2
} from '@/components/icons'
import { RailTooltip } from '@/components/shell/rail-button'
import { RAIL_SECTION_BUTTON_CLASS } from '@/components/sidebar/rail-section-header'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { FOCUS_RING_CLASS, QUIET_ICON_BUTTON_CLASS } from '@/components/ui/panel-styles'
import { addressLabel } from '@/lib/ssh-messages'
import { isTauriContext } from '@/lib/tauri-runtime'
import { cn } from '@/lib/utils'
import {
  SSH_HOSTS_TAB,
  useSSHActions,
  useSSHProfiles,
  useSSHSessions,
  useSSHShowAddresses
} from '@/stores/ssh-store'
import { reportImport } from './SSHHostsView'
import {
  SSHPanelDialogs,
  type SSHPanelDialogsController,
  useSSHPanelDialogs
} from './SSHPanelDialogs'
import { SSHSectionChevron } from './SSHSectionChevron'
import { resolveSSHHostState, SSHHostLamp, SSHHostStateWord } from './ssh-host-status'

/** Row action button (edit / connect): the 20px box of the Rail rows' `…`. */
const ROW_ACTION_BUTTON = `${QUIET_ICON_BUTTON_CLASS} size-5`

/**
 * The SSH section header, in the Rail section header's shape: 40px with 12px
 * on top, the start on x 20 (the row icons' left edge) and the end buttons
 * ending on x 228, so the last one is centred on x 218 with every `+` above.
 * The section spans the full 248px Rail, so the 20px padding stands in for
 * the lists' 8px inset plus the headers' 12px.
 */
export function SSHSectionHeader({
  start,
  children
}: {
  start: React.ReactNode
  /** End buttons ({@link RAIL_SECTION_BUTTON_CLASS}). */
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className="flex h-10 shrink-0 select-none items-center justify-between gap-2 px-5 pt-3 whitespace-nowrap"
      data-testid="ssh-section-header"
    >
      {start}
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  )
}

interface SSHPanelProps {
  /** Open a new session to the host. */
  onConnect?: (profileId: string) => void
  /** Open the SSH workspace focused on the host. */
  onSelectProfile?: (profileId: string) => void
  activeProfileId?: string | null
  /** Rail section: the header starts with the collapse toggle (chevron + label). */
  collapsible?: boolean
  /**
   * Host editor / delete confirm owned by a host outside this panel (the Rail
   * popover). When set, the panel only raises requests and renders no dialogs.
   */
  dialogs?: SSHPanelDialogsController
  /** Rail popover: host rows take focus and move with Up/Down. */
  focusableRows?: boolean
}

/** Compact host list for the sidebar section and the Rail popover. */
export function SSHPanel({
  onConnect,
  onSelectProfile,
  activeProfileId,
  collapsible = false,
  dialogs: externalDialogs,
  focusableRows = false
}: SSHPanelProps): React.JSX.Element {
  const profiles = useSSHProfiles()
  const sessions = useSSHSessions()
  const { loadProfiles, importConfig, duplicateProfile, setActiveTab, toggleShowAddresses } =
    useSSHActions()
  const showAddresses = useSSHShowAddresses()
  const ownDialogs = useSSHPanelDialogs()
  const dialogs = externalDialogs ?? ownDialogs
  const desktop = isTauriContext()

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  const handleImport = async () => reportImport(await importConfig())

  const handleDuplicate = async (profile: SSHProfile) => {
    const copy = await duplicateProfile(profile.id)
    if (copy) toast.success(`Duplicated as “${copy.name}”`)
    else toast.error(`Could not duplicate “${profile.name}”`)
  }

  // Up/Down move between host rows; Enter connects, Space opens the host.
  const handleRowKeyDown = (profileId: string) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (desktop) onConnect?.(profileId)
      else onSelectProfile?.(profileId)
      return
    }
    if (e.key === ' ') {
      e.preventDefault()
      onSelectProfile?.(profileId)
      return
    }
    const sibling =
      e.key === 'ArrowDown'
        ? e.currentTarget.nextElementSibling
        : e.key === 'ArrowUp'
          ? e.currentTarget.previousElementSibling
          : null
    if (sibling instanceof HTMLElement) {
      e.preventDefault()
      sibling.focus()
    }
  }

  const sorted = [...profiles].sort(
    (a, b) =>
      Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name)
  )

  return (
    <div className="flex h-full flex-col">
      <SSHSectionHeader
        start={
          collapsible ? (
            <SSHSectionChevron expanded count={profiles.length} />
          ) : (
            <span className="flex items-center gap-1">
              <span className="label-panel">SSH</span>
              {profiles.length > 0 && (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {profiles.length}
                </span>
              )}
            </span>
          )
        }
      >
        <DropdownMenu>
          <RailTooltip label="SSH options">
            <DropdownMenuTrigger asChild>
              <button type="button" className={RAIL_SECTION_BUTTON_CLASS} aria-label="SSH options">
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
          </RailTooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setActiveTab(SSH_HOSTS_TAB)}>
              <Server size={14} aria-hidden="true" className="mr-2 text-muted-foreground" />
              Open SSH hosts
            </DropdownMenuItem>
            {desktop && (
              <DropdownMenuItem onSelect={() => void handleImport()}>
                <Download size={14} aria-hidden="true" className="mr-2 text-muted-foreground" />
                Import from ~/.ssh/config
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* Shows/hides user@host:port on each row (privacy). */}
            <DropdownMenuCheckboxItem
              checked={showAddresses}
              onCheckedChange={toggleShowAddresses}
              onSelect={(e) => e.preventDefault()}
            >
              Show addresses
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RailTooltip label="New host">
          <button
            type="button"
            onClick={() => dialogs.openForm(null)}
            className={RAIL_SECTION_BUTTON_CLASS}
            aria-label="New host"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </RailTooltip>
      </SSHSectionHeader>

      <div className="flex-1 overflow-y-auto px-2 pb-1">
        {profiles.length === 0 ? (
          // The Rail's empty-section look ("No projects yet"), plus the two
          // ways to get a first host.
          <div
            className="flex flex-col items-center gap-2 px-6 pt-3 pb-4 text-center"
            data-testid="ssh-empty-state"
          >
            <div className="opacity-60">
              <p className="text-sm text-muted-foreground">No SSH hosts yet</p>
              <p className="mt-1 text-xs text-muted-foreground text-balance">
                Add a server to open a terminal on it
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => dialogs.openForm(null)}
              >
                <Plus size={14} aria-hidden="true" />
                Add host
              </Button>
              {desktop && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void handleImport()}
                >
                  <Download size={14} aria-hidden="true" />
                  Import ~/.ssh/config
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {sorted.map((profile) => {
              const hostSessions = sessions.filter((s) => s.profileId === profile.id)
              const hostState = resolveSSHHostState(hostSessions)
              const isSelected = activeProfileId === profile.id
              return (
                <ContextMenu key={profile.id}>
                  <ContextMenuTrigger asChild>
                    <div
                      // A Rail row: 12px left, 16px right, 8px gaps. The lamp
                      // sits on the icon column (x = 28), the name on x 44
                      // with the project names, the state word ends on x 224.
                      className={cn(
                        'group relative flex cursor-pointer items-center gap-2 rounded-lg pr-4 pl-3 text-xs transition-colors duration-150 ease-out',
                        showAddresses ? 'h-10' : 'h-7.5',
                        isSelected ? 'keycap text-foreground' : 'hover:bg-row-hover',
                        focusableRows && FOCUS_RING_CLASS
                      )}
                      data-selected={isSelected ? 'true' : undefined}
                      data-testid={`ssh-host-row-${profile.id}`}
                      tabIndex={focusableRows ? 0 : undefined}
                      onKeyDown={focusableRows ? handleRowKeyDown(profile.id) : undefined}
                      onClick={() => onSelectProfile?.(profile.id)}
                      onDoubleClick={() => {
                        if (desktop) onConnect?.(profile.id)
                      }}
                      title={desktop ? 'Click to open, double-click to connect' : undefined}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <SSHHostLamp state={hostState} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* A long name fades out at the end of its box, as the
                            Rail's project and chat names do (no "…"). The
                            favorite pin sits after that box, so the fade
                            cannot clip it. */}
                        <span className="flex min-w-0 items-center">
                          <span className="fade-end min-w-0 text-xs text-foreground">
                            {profile.name}
                          </span>
                          {profile.favorite && (
                            <Pin
                              size={10}
                              data-testid="ssh-host-favorite"
                              className="ml-1.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        {showAddresses && (
                          <span className="fade-end min-w-0 font-mono text-2xs text-muted-foreground">
                            {addressLabel(profile)}
                          </span>
                        )}
                      </div>
                      {/* The actions take the state word's place on hover/focus, so
                          the name keeps the row's width (no layout shift). */}
                      <SSHHostStateWord
                        state={hostState}
                        sessionCount={hostSessions.length}
                        className="shrink-0 pointer-fine:group-hover:invisible group-focus-within:invisible"
                      />
                      <div className="absolute right-3 flex items-center gap-0.5 transition-opacity duration-150 ease-out pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 group-focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            dialogs.openForm(profile)
                          }}
                          className={ROW_ACTION_BUTTON}
                          title="Edit host"
                          aria-label={`Edit ${profile.name}`}
                        >
                          <Edit size={12} />
                        </button>
                        {desktop && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onConnect?.(profile.id)
                            }}
                            className={ROW_ACTION_BUTTON}
                            title={hostSessions.length > 0 ? 'Open another session' : 'Connect'}
                            aria-label={`Connect to ${profile.name}`}
                          >
                            <Terminal size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    {desktop && (
                      <ContextMenuItem onSelect={() => onConnect?.(profile.id)}>
                        <Terminal className="mr-2 h-4 w-4" />
                        {hostSessions.length > 0 ? 'Open another session' : 'Connect'}
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem onSelect={() => dialogs.openForm(profile)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void handleDuplicate(profile)}>
                      <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => dialogs.requestDelete(profile)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )
            })}
          </div>
        )}
      </div>

      {!externalDialogs && <SSHPanelDialogs controller={ownDialogs} />}
    </div>
  )
}
