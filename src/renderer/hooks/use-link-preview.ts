import type { LinkPreview } from '@shared/types/ipc.types'
import { useEffect, useState } from 'react'
import { loadLinkPreview, peekLinkPreview } from '@/lib/link-preview-api'

export type LinkPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; preview: LinkPreview }
  | { status: 'none' }

function stateOf(value: LinkPreview | null | undefined): LinkPreviewState {
  if (value === undefined) return { status: 'loading' }
  return value ? { status: 'ready', preview: value } : { status: 'none' }
}

/**
 * The favicon + title for `url`, loaded once per URL per renderer session.
 * `enabled: false` (a still-streaming reply) keeps it idle in `loading`.
 */
export function useLinkPreview(url: string, enabled = true): LinkPreviewState {
  const [state, setState] = useState<LinkPreviewState>(() => stateOf(peekLinkPreview(url)))
  useEffect(() => {
    const known = peekLinkPreview(url)
    setState(stateOf(known))
    if (!enabled || known !== undefined) return
    let live = true
    void loadLinkPreview(url).then((preview) => {
      if (live) setState(stateOf(preview))
    })
    return () => {
      live = false
    }
  }, [url, enabled])
  return state
}
