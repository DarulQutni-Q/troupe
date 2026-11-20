import { type ReactNode, useEffect, useRef } from 'react'
import { ResizeEdges } from '@/components/ResizeEdges'
import { WindowControls } from '@/components/shell/TopRowChrome'
import { useTopRowPlatform } from '@/components/shell/top-row-context'
import { cn } from '@/lib/utils'

/** The one list of steps: "Step N of 3" and the dots derive from it. */
export const ONBOARDING_STEPS = ['welcome', 'agents', 'project'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const ONBOARDING_TITLE_CLASS =
  'text-hero font-normal leading-7 tracking-[-0.015em] text-foreground outline-hidden'

/** Phone floor for every footer and row control. */
export const TOUCH_TARGET_CLASS = 'pointer-coarse:min-h-11'

/**
 * The full window first run lives in. The shell's top row is not mounted, so
 * on the desktop the frame brings its own drag strip and, on Windows and
 * Linux, the window controls. Web and phone get neither and clear the safe
 * areas instead.
 */
export function OnboardingWindow({ children }: { children: ReactNode }): React.JSX.Element {
  const platform = useTopRowPlatform()
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background" data-testid="onboarding">
      <ResizeEdges />
      {platform.dragRegions && (
        <div className="flex h-11 shrink-0 items-center justify-end" data-tauri-drag-region>
          <WindowControls windowControls={platform.windowControls} />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  )
}

/** Focuses a step's title when the step mounts, so screen readers announce the change. */
export function useStepTitleFocus(): React.RefObject<HTMLHeadingElement> {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [])
  return ref
}

function StepDots({ step }: { step: OnboardingStep }): React.JSX.Element {
  const index = ONBOARDING_STEPS.indexOf(step)
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {ONBOARDING_STEPS.map((id, i) => (
          <span
            key={id}
            className={cn(
              'h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out motion-reduce:transition-none',
              i === index ? 'w-4 bg-foreground' : 'w-1.5',
              i < index && 'bg-foreground/50',
              i > index && 'bg-foreground/15'
            )}
          />
        ))}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        Step {index + 1} of {ONBOARDING_STEPS.length}
      </span>
    </div>
  )
}

export function StepFrame({
  step,
  title,
  body,
  wide,
  footer,
  children
}: {
  step: Exclude<OnboardingStep, 'welcome'>
  title: string
  body: ReactNode
  wide?: boolean
  footer: ReactNode
  children: ReactNode
}): React.JSX.Element {
  const titleRef = useStepTitleFocus()
  return (
    <div className="flex flex-1 flex-col items-center px-6 py-10">
      <div
        className={cn(
          'my-auto flex w-full flex-col gap-6',
          wide ? 'max-w-[560px]' : 'max-w-[480px]'
        )}
      >
        <StepDots step={step} />
        <div className="flex flex-col gap-1.5">
          <h1 ref={titleRef} tabIndex={-1} className={ONBOARDING_TITLE_CLASS}>
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        {children}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">{footer}</div>
      </div>
    </div>
  )
}
