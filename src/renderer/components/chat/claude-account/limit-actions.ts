import type { ClaudeLimitActionEvent } from '@shared/types/claude-accounts.types'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { ACP_EVENTS, onAcpEvent } from '@/lib/acp-api'
import { logFrontendError } from '@/lib/log-api'
import { renewAgentCredentials, useAcpStore } from '@/stores/acp-store'
import { CLAUDE_AGENT_CONFIG_ID } from '@/stores/claude-account-switch'

/** When the host continues each chat after its limit resets, epoch ms. */
export const useClaudeResumeAt = create<Record<string, number>>(() => ({}))

function setResumeAt(sessionId: string, at: number | null): void {
  useClaudeResumeAt.setState((s) => {
    const { [sessionId]: _done, ...rest } = s
    return at === null ? rest : { ...rest, [sessionId]: at }
  }, true)
}

function followAgent(sessionId: string, fromAgentId: string | null, newAgentId: string): boolean {
  let followed = false
  useAcpStore.setState((s) => {
    const session = s.sessions[sessionId]
    if (!session || fromAgentId === null || session.agentId !== fromAgentId) return {}
    if (s.agentStatus[newAgentId] !== 'connected') return {}
    followed = true
    let sessionUsage = s.sessionUsage
    const usage = s.sessionUsage[sessionId]
    if (usage?.rateLimit) {
      const { rateLimit: _cleared, ...rest } = usage
      sessionUsage = { ...s.sessionUsage, [sessionId]: rest }
    }
    return {
      sessions: {
        ...s.sessions,
        [sessionId]: { ...session, agentId: newAgentId, status: 'active' }
      },
      sessionUsage
    }
  })
  return followed
}

const reportedFailures = new Set<string>()

export function applyClaudeLimitAction(e: ClaudeLimitActionEvent): void {
  switch (e.action) {
    case 'resume_scheduled':
      setResumeAt(e.sessionId, e.at)
      return
    case 'resume_cancelled':
      setResumeAt(e.sessionId, null)
      return
    case 'failed': {
      setResumeAt(e.sessionId, null)
      const key = `${e.sessionId}:${e.reason}`
      if (reportedFailures.has(key)) return
      reportedFailures.add(key)
      toast.warning('Troupe could not continue the chat', { description: e.reason })
      return
    }
    case 'switched':
    case 'resumed': {
      setResumeAt(e.sessionId, null)
      if (!followAgent(e.sessionId, e.fromAgentId, e.newAgentId)) return
      void logFrontendError({
        level: 'info',
        source: 'claudeLimit.follow',
        message: `Chat ${e.sessionId} follows host agent ${e.newAgentId} (${e.action})`
      })
      if (e.action === 'switched') {
        renewAgentCredentials(CLAUDE_AGENT_CONFIG_ID, e.projectId)
        toast.success(`${e.from.name} reached its limit. Continued on ${e.to.name}.`)
      }
    }
  }
}

/** Mount once per renderer root. */
export function useClaudeLimitActions(): void {
  useEffect(
    () => onAcpEvent<ClaudeLimitActionEvent>(ACP_EVENTS.claudeLimitAction, applyClaudeLimitAction),
    []
  )
}
