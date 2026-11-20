import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { logFrontendError } from '@/lib/log-api'
import {
  getServerCapabilitySnapshot,
  isTauriContext,
  subscribeServerCapability
} from '@/lib/tauri-runtime'
import { type AppSettingsHostRead, useAppSettingsStore } from '@/stores/app-settings-store'
import { useProjectStore } from '@/stores/project-store'

/** Whether this client may write settings and add projects. */
export type WriteAdmission = 'pending' | 'admitted' | 'refused' | 'timed-out'

export interface OnboardingFacts {
  hostRead: AppSettingsHostRead
  completedAt: string | null
  projectsLoaded: boolean
  projectCount: number
  writes: WriteAdmission
}

export type OnboardingDecision = 'pending' | 'show' | 'skip'

/** A web client whose `/health` never answers sees the workspace after this, not a loading screen. */
export const WRITE_ADMISSION_TIMEOUT_MS = 5000

/**
 * First run shows only when every fact holds. One fact that says skip
 * decides at once, so a user with projects never waits on the settings read
 * or `/health`. A failed settings read never shows it: the defaults in the
 * store are not the user's settings, and the host would refuse the
 * completion write anyway.
 */
export function decideOnboarding(facts: OnboardingFacts): OnboardingDecision {
  if (facts.projectsLoaded && facts.projectCount > 0) return 'skip'
  if (facts.hostRead === 'failed') return 'skip'
  if (facts.hostRead !== 'pending' && facts.completedAt !== null) return 'skip'
  if (facts.writes === 'refused' || facts.writes === 'timed-out') return 'skip'
  if (facts.hostRead === 'pending' || !facts.projectsLoaded || facts.writes === 'pending') {
    return 'pending'
  }
  return 'show'
}

function writeAdmission(
  capability: { resolved: boolean; admitted: boolean },
  timedOut: boolean
): WriteAdmission {
  if (isTauriContext()) return 'admitted'
  if (capability.resolved) return capability.admitted ? 'admitted' : 'refused'
  return timedOut ? 'timed-out' : 'pending'
}

export interface OnboardingGate {
  state: OnboardingDecision
  /** Leaves onboarding for the rest of this layout's life. */
  close: () => void
}

/**
 * Reads the facts from their owners and latches the first decision that is
 * not `pending`. The latch keeps the flow mounted after its project step adds
 * the first project, and keeps it closed if the last project is removed later.
 */
export function useOnboardingGate(): OnboardingGate {
  const hostRead = useAppSettingsStore((s) => s.hostRead)
  const completedAt = useAppSettingsStore((s) => s.settings.onboardingCompletedAt)
  const projectsLoaded = useProjectStore((s) => s.isLoaded)
  const projectCount = useProjectStore((s) => s.projects.length)
  const capability = useSyncExternalStore(subscribeServerCapability, getServerCapabilitySnapshot())
  const [timedOut, setTimedOut] = useState(false)
  const writes = writeAdmission(capability, timedOut)

  const live = decideOnboarding({ hostRead, completedAt, projectsLoaded, projectCount, writes })
  const [latched, setLatched] = useState<'show' | 'skip' | null>(null)
  if (latched === null && live !== 'pending') setLatched(live)

  const waitingOnWrites = latched === null && writes === 'pending'
  useEffect(() => {
    if (!waitingOnWrites) return
    const timer = window.setTimeout(() => {
      void logFrontendError({
        level: 'warn',
        source: 'onboarding',
        message: `Write admission still unknown after ${WRITE_ADMISSION_TIMEOUT_MS} ms; skipping first run`
      })
      setTimedOut(true)
    }, WRITE_ADMISSION_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [waitingOnWrites])

  const close = useCallback(() => setLatched('skip'), [])
  return { state: latched ?? live, close }
}
