import type { ClaudeRateLimit } from '@shared/types/claude-accounts.types'
import type { CodexAccountUsage, CodexUsageWindow } from '@shared/types/codex-accounts.types'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { toastAccountChoiceError } from '@/components/settings/provider/account-choice-error'
import { codexAccountsApi } from '@/lib/codex-accounts-api'
import { codexResetSeconds, formatUsageReset, primaryCodexWindow } from '@/lib/codex-usage-format'
import { logFrontendError } from '@/lib/log-api'
import { useAcpStore } from '@/stores/acp-store'
import {
  chatSwitchNotice,
  chatSwitchToast,
  showChatSwitchToast,
  switchChatCodexAccount
} from '@/stores/codex-account-switch'
import { useChatCodexAccount } from './use-chat-codex-account'
import type { CodexAccountChoice, ProjectCodexAccount } from './use-project-codex-account'

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'weekly',
  session: '5-hour',
  weekly: 'weekly'
}

export const windowName = (limit: ClaudeRateLimit): string =>
  (limit.kind && WINDOW_NAMES[limit.kind]) || 'usage'

export const formatClock = (ms: number): string =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Near the limit: a calm warning from 80%. */
export const isNearLimit = (limit: ClaudeRateLimit): boolean =>
  limit.status === 'allowed_warning' || (limit.status === 'allowed' && (limit.percent ?? 0) >= 80)

/** At the limit. Codex has no paid overage that carries the turn. */
export const isAtLimit = (limit: ClaudeRateLimit): boolean => limit.status === 'rejected'

function kindOf(window: CodexUsageWindow): string {
  return window.kind === 'weekly' ? 'seven_day' : 'five_hour'
}

/** The limit to show: a rejected turn first, else the probe window. */
export function codexDisplayLimit(
  live: ClaudeRateLimit | null,
  usage: CodexAccountUsage | undefined
): ClaudeRateLimit | null {
  const window = primaryCodexWindow(usage)
  if (live?.status === 'rejected') {
    return {
      status: 'rejected',
      resetsAt: live.resetsAt ?? codexResetSeconds(window),
      kind: live.kind ?? (window ? kindOf(window) : null),
      percent: live.percent ?? window?.percent ?? 100,
      overageInUse: false
    }
  }
  if (!window || window.percent < 80) return null
  return {
    status: window.percent >= 100 ? 'rejected' : 'allowed_warning',
    resetsAt: codexResetSeconds(window),
    kind: kindOf(window),
    percent: window.percent,
    overageInUse: false
  }
}

interface ResumeState {
  at: Record<string, number>
  /** `openTurnId` when the resume was scheduled. `null` means the turn had already ended. */
  turns: Record<string, string | null>
  timers: Record<string, ReturnType<typeof setTimeout>>
  schedule: (sessionId: string, at: number) => void
  /** Drop the local schedule. Does not talk to the host. */
  forget: (sessionId: string) => void
  /** Drop the local schedule and ask the host to drop it. */
  cancel: (sessionId: string) => void
}

/** A newer turn started after the resume was scheduled. */
function turnReplaced(scheduled: string | null, current: string | null): boolean {
  if (scheduled === null) return current !== null
  return current !== null && current !== scheduled
}

function ownsResume(sessionId: string, at: number, turnId: string | null): boolean {
  const state = useCodexResumeStore.getState()
  return state.at[sessionId] === at && state.turns[sessionId] === turnId
}

/** Drop the local schedule. The host copy is a separate call. */
function forgetResume(
  set: (partial: Partial<ResumeState>) => void,
  get: () => ResumeState,
  sessionId: string
): void {
  const timer = get().timers[sessionId]
  if (timer) clearTimeout(timer)
  set({
    at: Object.fromEntries(Object.entries(get().at).filter(([id]) => id !== sessionId)),
    turns: Object.fromEntries(Object.entries(get().turns).filter(([id]) => id !== sessionId)),
    timers: Object.fromEntries(Object.entries(get().timers).filter(([id]) => id !== sessionId))
  })
}

export const useCodexResumeStore = create<ResumeState>((set, get) => ({
  at: {},
  turns: {},
  timers: {},
  schedule: (sessionId, at) => {
    forgetResume(set, get, sessionId)
    const turnId = useAcpStore.getState().sessions[sessionId]?.openTurnId ?? null
    set((state) => ({
      at: { ...state.at, [sessionId]: at },
      turns: { ...state.turns, [sessionId]: turnId }
    }))
    void codexAccountsApi.setResume(sessionId, at).then(
      () => {
        const current = useAcpStore.getState().sessions[sessionId]?.openTurnId ?? null
        // The host marks the turn when this request arrives. A turn that
        // started while it was in flight is not "after" that mark, so tell
        // the host to drop the schedule once the request has landed.
        if (!ownsResume(sessionId, at, turnId) || turnReplaced(turnId, current)) {
          return codexAccountsApi.setResume(sessionId, null).then(() => {
            if (ownsResume(sessionId, at, turnId)) get().forget(sessionId)
          })
        }
      },
      (error: unknown) => {
        void logFrontendError({
          level: 'warn',
          source: 'codexLimit.resume',
          message: `Could not ask the host to continue chat ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
        })
        if (!ownsResume(sessionId, at, turnId)) return
        get().forget(sessionId)
        toastAccountChoiceError(error, 'Could not schedule the continue')
      }
    )
  },
  forget: (sessionId) => forgetResume(set, get, sessionId),
  cancel: (sessionId) => {
    forgetResume(set, get, sessionId)
    void codexAccountsApi.setResume(sessionId, null).catch((error: unknown) => {
      void logFrontendError({
        level: 'warn',
        source: 'codexLimit.resume',
        message: `Could not cancel the continue for chat ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      })
    })
  }
}))

let stopResumeTurnWatch: (() => void) | undefined

/** Watch turn changes even when no limit card is mounted. Idempotent, and a
 * no-op when the store mock has no `subscribe` (component tests). */
export function ensureCodexResumeTurnWatch(): void {
  if (stopResumeTurnWatch) return
  if (typeof useAcpStore.subscribe !== 'function') return
  stopResumeTurnWatch = useAcpStore.subscribe((state, prev) => {
    if (state.sessions === prev.sessions) return
    const { turns, cancel } = useCodexResumeStore.getState()
    for (const sessionId of Object.keys(turns)) {
      const current = state.sessions[sessionId]?.openTurnId ?? null
      if (turnReplaced(turns[sessionId], current)) cancel(sessionId)
    }
  })
}

export const useCodexSwitchingStore = create<Record<string, string>>(() => ({}))

export function setSwitchingTo(sessionId: string, accountName: string | null): void {
  useCodexSwitchingStore.setState((state) => {
    const { [sessionId]: _done, ...rest } = state
    return accountName ? { ...rest, [sessionId]: accountName } : rest
  }, true)
}

const dismissed = new Set<string>()

export interface CodexLimit {
  ctx: ProjectCodexAccount
  limit: ClaudeRateLimit
  name: string
  reset: string | null
  dismiss: () => void
  switchTo: (target: CodexAccountChoice) => Promise<void>
  switchingTo: string | null
}

/**
 * Live limit state of one Codex chat, shared by the composer warning and the
 * at-limit card. `null` when there is no limit to show or the user dismissed it.
 */
export function useCodexLimit(sessionId: string): CodexLimit | null {
  const ctx = useChatCodexAccount(sessionId)
  const live = useAcpStore((state) => state.sessionUsage?.[sessionId]?.rateLimit ?? null)
  const openTurnId = useAcpStore((state) => state.sessions[sessionId]?.openTurnId ?? null)
  const cancelResume = useCodexResumeStore((state) => state.cancel)
  const scheduledTurn = useCodexResumeStore((state) =>
    sessionId in state.turns ? state.turns[sessionId] : undefined
  )
  const switchingTo = useCodexSwitchingStore((state) => state[sessionId] ?? null)
  useEffect(() => {
    ensureCodexResumeTurnWatch()
  }, [])
  useEffect(() => {
    if (scheduledTurn === undefined) return
    if (turnReplaced(scheduledTurn, openTurnId)) cancelResume(sessionId)
  }, [scheduledTurn, openTurnId, sessionId, cancelResume])
  const [, rerender] = useState(0)
  const limit = ctx ? codexDisplayLimit(live, ctx.current.usage) : null
  if (!ctx || !limit) return null

  const key = `${sessionId}:${limit.status}:${limit.resetsAt ?? ''}`
  if (dismissed.has(key)) return null

  const projectId = ctx.projectId
  const currentAccountId = ctx.current.account.id
  const currentName = ctx.current.account.name
  const ownAccountId = ctx.ownAccount ? currentAccountId : null
  const projectAccountId = ctx.projectAccount.id
  const reloadAccounts = ctx.accounts.reload
  const atLimit = limit.status === 'rejected'
  const limitWindow = windowName(limit)
  async function switchTo(target: CodexAccountChoice): Promise<void> {
    if (useCodexSwitchingStore.getState()[sessionId]) return
    setSwitchingTo(sessionId, target.account.name)
    cancelResume(sessionId)
    // The clock clears locally. The host still continues at the reset unless told.
    void codexAccountsApi.setResume(sessionId, null).catch(() => undefined)
    try {
      const moved = await switchChatCodexAccount(
        {
          sessionId,
          projectId,
          runsOn: currentAccountId,
          ownAccountId,
          projectAccountId
        },
        target.account.id,
        atLimit ? { notice: chatSwitchNotice(currentName, target.account.name, limitWindow) } : {}
      )
      await reloadAccounts()
      showChatSwitchToast(chatSwitchToast(moved, target.account.name))
    } catch (err) {
      toastAccountChoiceError(err, 'Could not switch')
      void reloadAccounts()
    } finally {
      setSwitchingTo(sessionId, null)
    }
  }

  return {
    ctx,
    limit,
    name: ctx.current.account.name,
    reset: formatUsageReset(limit.resetsAt),
    dismiss: () => {
      dismissed.add(key)
      rerender((count) => count + 1)
    },
    switchTo,
    switchingTo
  }
}
