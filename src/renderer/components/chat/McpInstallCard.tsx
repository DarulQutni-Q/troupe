import type { McpInstallField } from '@shared/types/mcp-install.types'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CONSENT_WARNING_COPY } from '@/components/settings/McpConsentDialog'
import {
  initialInstallValues,
  McpInstallForm,
  splitInstallValues
} from '@/components/settings/McpInstallForm'
import { Button } from '@/components/ui/button'
import { logFrontendError } from '@/lib/log-api'
import type { PendingMcpInstall } from '@/lib/mcp-install-request'
import { cn } from '@/lib/utils'
import { useAcpStore } from '@/stores/acp-store'
import { CHAT_GUTTER_X, PROMPT_PANEL_CLASS, QUESTION_PANEL_MAX_H } from './chat-layout'

interface McpInstallCardProps {
  install: PendingMcpInstall
  projectId: string | null
}

/**
 * Approval card for `mcp_install`. Secret field values stay in this component
 * until Install. They are not written to the store, the tool result, or a log.
 */
export function McpInstallCard({ install, projectId }: McpInstallCardProps): React.JSX.Element {
  const answer = useAcpStore((s) => s.answerMcpInstall)
  const dismiss = useAcpStore((s) => s.dismissMcpInstall)
  const connect = useAcpStore((s) => s.connectMcpOAuth)
  const [values, setValues] = useState(() => initialInstallValues(install.form.fields))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const valuesRef = useRef(values)
  valuesRef.current = values
  const [baseline, setBaseline] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!install.launchDigest) {
      setBaseline(null)
      return
    }
    setBaseline(JSON.stringify(splitInstallValues(install.form.fields, valuesRef.current).inputs))
  }, [install.launchDigest, install.form])

  const { inputs } = splitInstallValues(install.form.fields, values)
  const reviewed = baseline !== null && JSON.stringify(inputs) === baseline
  const consent = install.consent

  const missing = (fields: McpInstallField[]): Record<string, string> =>
    Object.fromEntries(
      fields
        .filter((field) => field.isRequired && (values[field.id] ?? '').trim() === '')
        .map((field) => [field.id, 'Fill this in to continue.'])
    )

  const send = (decision: 'decline' | 'preview' | 'approve'): void => {
    const required =
      decision === 'decline'
        ? []
        : install.form.fields.filter((field) => (decision === 'preview' ? !field.isSecret : true))
    const errors = missing(required)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    const split = splitInstallValues(install.form.fields, values)
    void answer(
      install.requestId,
      decision,
      split.inputs,
      decision === 'approve' ? split.secretValues : undefined
    ).catch((error: unknown) => {
      void logFrontendError({
        level: 'warn',
        source: 'chat.McpInstallCard',
        message: `mcp install ${decision} failed (${error instanceof Error ? error.name : 'error'})`
      })
      toast.error('Could not send your decision. Try again.')
    })
  }

  const signIn = (): void => {
    const serverId = install.result?.serverId
    if (!serverId || projectId === null) return
    void connect(projectId, serverId)
      .then((connected) => {
        if (connected) toast.success(`Connected to ${install.name}`)
      })
      .catch(() => toast.error('Could not start sign-in. Try again from Settings.'))
  }

  const result = install.result

  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className={cn(CHAT_GUTTER_X, 'pb-6 pt-3')}
      data-testid="mcp-install-card"
    >
      <section className={cn('mx-auto w-full max-w-3xl', PROMPT_PANEL_CLASS)}>
        <div
          className={cn('grid gap-3 overflow-y-auto p-4', QUESTION_PANEL_MAX_H, 'scroller-thin')}
        >
          <div>
            <p className="text-xs text-muted-foreground">Install MCP server</p>
            <h2 id={titleId} className="text-sm font-medium text-foreground">
              {install.title}
            </h2>
          </div>
          {consent && (
            <Launch
              transport={consent.transport}
              command={consent.command}
              argv={consent.argv}
              url={consent.url}
            />
          )}
          {consent && consent.warnings.length > 0 && (
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {consent.warnings.map((warning) => (
                <li key={warning}>{CONSENT_WARNING_COPY[warning]}</li>
              ))}
            </ul>
          )}
          {install.form.fields.length > 0 && !result && (
            <McpInstallForm
              fields={install.form.fields}
              values={values}
              disabled={install.saving}
              errors={fieldErrors}
              onChange={(id, value) => {
                setValues((current) => ({ ...current, [id]: value }))
                setFieldErrors((current) => {
                  const { [id]: _cleared, ...rest } = current
                  return rest
                })
              }}
            />
          )}
          {install.error && <p className="text-xs text-destructive">{install.error}</p>}
          {result && (
            <div className="grid gap-2">
              <p className="text-sm text-foreground">
                {result.outcome === 'installed'
                  ? `${install.name} is installed.`
                  : result.outcome === 'already_exists'
                    ? `${result.name ?? install.name} is already installed.`
                    : 'Nothing was saved.'}
              </p>
              <ul className="grid gap-1 text-xs text-muted-foreground">
                {result.nextSteps.map((step) => (
                  <li key={`${step.kind}-${step.runtime ?? ''}`}>{step.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 px-4 py-3">
          {result ? (
            <>
              {result.oauth && result.serverId && (
                <Button type="button" onClick={signIn}>
                  Sign in
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => dismiss(install.requestId)}>
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={install.saving}
                onClick={() => send('decline')}
              >
                Decline
              </Button>
              {consent && reviewed ? (
                <Button type="button" disabled={install.saving} onClick={() => send('approve')}>
                  {install.saving ? 'Installing…' : 'Install'}
                </Button>
              ) : (
                <Button type="button" disabled={install.saving} onClick={() => send('preview')}>
                  Review command
                </Button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function Launch({
  transport,
  command,
  argv,
  url
}: {
  transport: string
  command: string | null
  argv: string[]
  url: string | null
}): React.JSX.Element {
  if (transport !== 'stdio') {
    return (
      <p className="break-all font-mono text-xs text-foreground">
        <span className="text-muted-foreground">{transport} </span>
        {url}
      </p>
    )
  }
  return (
    <div className="grid gap-1">
      <p className="break-all font-mono text-xs text-foreground">{command}</p>
      {argv.length > 0 && (
        <ol className="grid gap-0.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
          {argv.map((arg, index) => (
            <li key={`${index}-${arg}`} className="break-all font-mono text-xs text-foreground">
              {arg}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
