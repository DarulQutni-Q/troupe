/**
 * An orchestrated subagent runs as its own host agent and raises its approvals
 * under its chat's session, as itself (`agentId` is the child's, matching its
 * record's `agent.agentId`). Those approvals belong to the subagent's run, not
 * to the chat's turn: a turn end drops only the approvals of the agent whose
 * turn it was, and the run's settle card dismisses the run's own. The host
 * releases its relay tickets by the same key.
 */

import type { AgentId, SessionId } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { parseSubagent } from './subagent-lifecycle'
import type { AcpState, PendingPermission } from './types'

/** Remove the pending permissions `agentId` raised in `sessionId`. */
export function dropAgentPermissionsInSession(
  pending: Record<string, PendingPermission>,
  sessionId: SessionId,
  agentId: AgentId
): Record<string, PendingPermission> {
  const next = { ...pending }
  for (const id of Object.keys(next)) {
    if (next[id].sessionId === sessionId && next[id].agentId === agentId) delete next[id]
  }
  return next
}

/**
 * The card of an orchestrated run that settled dismisses the approvals its
 * agent still had up in `sessionId`: nothing else on the chat ends them, as
 * the subagent's own turn end and disconnect never reach the chat. A call
 * that settles no run, or a run with none up, writes nothing.
 */
export function dismissSettledChildApprovals(
  get: () => Pick<AcpState, 'pendingPermissions'>,
  set: (partial: Pick<AcpState, 'pendingPermissions'>) => void,
  sessionId: SessionId,
  call: { toolCallId: string; _meta?: unknown }
): void {
  const record = parseSubagent(call.toolCallId, call._meta)
  if (record?.source !== 'orchestrated' || record.activity !== 'idle' || !record.agent) return
  const pending = get().pendingPermissions
  const next = dropAgentPermissionsInSession(pending, sessionId, record.agent.agentId)
  const dismissed = Object.keys(pending).length - Object.keys(next).length
  if (dismissed === 0) return
  set({ pendingPermissions: next })
  void logFrontendError({
    level: 'info',
    source: 'acp.childApprovals',
    message: `Dismissed ${dismissed} approval(s) of a settled orchestrated subagent`
  })
}
