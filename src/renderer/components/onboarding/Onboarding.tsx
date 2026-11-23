import { useEffect, useState } from 'react'
import type { SupportedAcpAgentEntry } from '@/lib/agents/supported-acp-agents'
import { logFrontendError } from '@/lib/log-api'
import { AgentsStep } from './AgentsStep'
import { landOnboarding } from './land-onboarding'
import { ONBOARDING_STEPS, type OnboardingStep, OnboardingWindow } from './OnboardingFrame'
import { ProjectStep } from './ProjectStep'
import { WelcomeStep } from './WelcomeStep'

/**
 * Full-window first run, rendered in place of the shell on every surface.
 * It holds only the step and the two picks that cross steps; each step reads
 * live data from the stores when it mounts.
 */
export function Onboarding({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [step, setStep] = useState<OnboardingStep>('welcome')
  const [agent, setAgent] = useState<SupportedAcpAgentEntry | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [landing, setLanding] = useState(false)

  useEffect(() => {
    void logFrontendError({
      level: 'info',
      source: 'onboarding',
      message: `Step ${ONBOARDING_STEPS.indexOf(step) + 1} (${step})`
    })
  }, [step])

  const finish = (picked: string | null): void => {
    if (landing) return
    setLanding(true)
    void landOnboarding({ agent, projectId: picked }, onClose).catch((err: unknown) => {
      void logFrontendError({
        level: 'error',
        source: 'onboarding',
        message: `Landing failed: ${String(err)}`
      })
    })
  }

  let content: React.JSX.Element
  switch (step) {
    case 'welcome':
      content = <WelcomeStep onNext={() => setStep('agents')} />
      break
    case 'agents':
      content = (
        <AgentsStep
          initialConfigId={agent?.configId ?? null}
          onBack={() => setStep('welcome')}
          onDone={(picked) => {
            setAgent(picked)
            void logFrontendError({
              level: 'info',
              source: 'onboarding',
              message: `Agent chosen: ${picked?.id ?? 'none'}`
            })
            setStep('project')
          }}
        />
      )
      break
    case 'project':
      content = (
        <ProjectStep
          projectId={projectId}
          onPicked={setProjectId}
          onBack={() => setStep('agents')}
          hasAgent={agent !== null}
          landing={landing}
          onFinish={finish}
        />
      )
      break
  }
  return <OnboardingWindow>{content}</OnboardingWindow>
}
