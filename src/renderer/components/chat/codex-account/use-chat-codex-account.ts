import type { CodexAccountView } from '@shared/types/codex-accounts.types'
import { primaryCodexWindow } from '@/lib/codex-usage-format'
import { useAcpStore } from '@/stores/acp-store'
import { isCodexSession } from '@/stores/codex-account-switch'
import {
  codexAccountFor,
  ownChatAccountId,
  type ProjectCodexAccount,
  useProjectCodexAccount
} from './use-project-codex-account'

export interface ChatCodexAccount extends ProjectCodexAccount {
  sessionId: string
  /** The chat runs an Account of its own, not its Project's. */
  ownAccount: boolean
  projectAccount: CodexAccountView
}

/** The Codex Account of one chat; `null` when the chat is not a managed Codex chat. */
export function useChatCodexAccount(sessionId: string): ChatCodexAccount | null {
  const isCodex = useAcpStore((s) => isCodexSession(s, sessionId))
  const projectId = useAcpStore((s) => s.sessions?.[sessionId]?.projectId ?? '')
  const project = useProjectCodexAccount(isCodex && projectId ? projectId : null)
  if (!project?.accounts.snapshot) return null
  const snapshot = project.accounts.snapshot
  const currentId = codexAccountFor(snapshot, project.projectId, sessionId)
  const current = snapshot.accounts.find((account) => account.id === currentId)
  const projectAccountId = snapshot.projectAccounts[project.projectId] ?? snapshot.defaultAccountId
  const projectAccount =
    snapshot.accounts.find((account) => account.id === projectAccountId) ?? null
  if (!current || !projectAccount) return null
  const usage = project.accounts.usage[current.id]
  return {
    ...project,
    sessionId,
    current: { account: current, usage, window: primaryCodexWindow(usage) },
    ownAccount: ownChatAccountId(snapshot, sessionId) !== null,
    projectAccount
  }
}
