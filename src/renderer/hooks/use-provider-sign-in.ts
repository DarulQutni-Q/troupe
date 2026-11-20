import type { ClaudeAccountView } from '@shared/types/claude-accounts.types'
import type { CodexAccountView } from '@shared/types/codex-accounts.types'
import { useCallback } from 'react'
import { accountReadiness } from '@/components/settings/provider/account-status'
import { codexAccountReadiness } from '@/components/settings/provider/codex-account-status'
import { useClaudeAccounts } from '@/hooks/use-claude-accounts'
import { useCodexAccounts } from '@/hooks/use-codex-accounts'
import type { AgentSignIn } from '@/lib/agents/agent-setup'

/** A provider whose default-account login is readable without spawning its agent. */
export type SignInProvider =
  | { kind: 'claude'; account: ClaudeAccountView }
  | { kind: 'codex'; account: CodexAccountView }

export interface ProviderSignIn {
  /** The sign-in state for an agent row; `null` for agents not checked here. */
  of: (agentId: string) => AgentSignIn | null
  /** The default account a row's Sign in acts on. */
  providerOf: (agentId: string) => SignInProvider | null
  /** Reads both account lists again. */
  reload: () => Promise<void>
}

function defaultAccount<A extends { id: string }>(
  snapshot: { accounts: A[]; defaultAccountId: string } | null
): A | null {
  return snapshot?.accounts.find((a) => a.id === snapshot.defaultAccountId) ?? null
}

/**
 * The Claude (`claude-acp`) and Codex (`codex-acp`) default accounts as
 * sign-in states. A list that failed or has no default account reads as
 * `null`: unknown is not signed out, so the row stays Ready and the launcher
 * decides at first send.
 */
export function useProviderSignIn(): ProviderSignIn {
  const claude = useClaudeAccounts({ usage: false })
  const codex = useCodexAccounts()
  const claudeDefault = defaultAccount(claude.snapshot)
  const codexDefault = defaultAccount(codex.snapshot)

  const providerOf = (agentId: string): SignInProvider | null => {
    if (agentId === 'claude-acp' && claudeDefault) return { kind: 'claude', account: claudeDefault }
    if (agentId === 'codex-acp' && codexDefault) return { kind: 'codex', account: codexDefault }
    return null
  }

  const of = (agentId: string): AgentSignIn | null => {
    if (agentId === 'claude-acp') {
      if (claude.loading && !claude.snapshot) return 'checking'
      return claudeDefault && !claude.error ? accountReadiness(claudeDefault, undefined) : null
    }
    if (agentId === 'codex-acp') {
      if (codex.loading && !codex.snapshot) return 'checking'
      return codexDefault && !codex.error ? codexAccountReadiness(codexDefault) : null
    }
    return null
  }

  const reloadClaude = claude.reload
  const reloadCodex = codex.reload
  const reload = useCallback(async () => {
    await Promise.all([reloadClaude(), reloadCodex()])
  }, [reloadClaude, reloadCodex])

  return { of, providerOf, reload }
}
