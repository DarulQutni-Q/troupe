import { ConfirmedExternalLink } from '@/components/external-link/ExternalLinkConfirm'
import { Globe } from '@/components/icons'
import { useLinkPreview } from '@/hooks/use-link-preview'
import { linkHostLabel } from '@/lib/chat-links'
import { cn } from '@/lib/utils'

interface LinkChipProps {
  url: string
  /** `false` while a reply is still streaming: the URL may be incomplete. */
  resolve?: boolean
  className?: string
}

/**
 * A written link shown as favicon + page title (Open Graph title, else the
 * `<title>`). While the preview loads it shows the host; when the page has no
 * preview it falls back to the URL itself, so a link never loses its target
 * text. The full URL is always the tooltip. Shown in sent user bubbles and
 * agent replies only; the composer keeps links as plain text. Clicks go
 * through the external-link confirm.
 */
export function LinkChip({ url, resolve = true, className }: LinkChipProps): React.JSX.Element {
  const state = useLinkPreview(url, resolve)
  const preview = state.status === 'ready' ? state.preview : null
  const label =
    preview?.title ??
    preview?.siteName ??
    (state.status === 'none' || !resolve ? url : linkHostLabel(url))
  const body = (
    <>
      {preview?.iconDataUri ? (
        <img
          src={preview.iconDataUri}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="size-[1em] shrink-0 rounded-sm object-contain"
          data-testid="link-chip-icon"
        />
      ) : (
        <Globe size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="max-w-[48ch] truncate pb-px leading-tight underline underline-offset-2">
        {label}
      </span>
    </>
  )
  const chipClass = cn(
    'inline-flex max-w-full items-center gap-1 align-middle leading-none font-medium text-primary',
    className
  )
  return (
    <ConfirmedExternalLink
      href={url}
      title={url}
      className={chipClass}
      data-testid="link-chip"
      data-url={url}
      data-streamdown="link"
    >
      {body}
    </ConfirmedExternalLink>
  )
}
