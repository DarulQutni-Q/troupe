import type { LinkPreview } from '@shared/types/ipc.types'
import { postJson } from './ipc/http'
import { invokeIpc } from './ipc/tauri'
import { logFrontendError } from './log-api'
import { isTauriContext } from './tauri-runtime'

/**
 * Favicon + title for a chat link. Desktop invokes `link_preview_resolve`;
 * web/remote posts `/link/preview`. Both resolve the same shared Rust
 * resolver, which only reaches public http(s) addresses. `null` means "show
 * the plain link" — every failure (transport included) degrades to `null`.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const res = isTauriContext()
    ? await invokeIpc<LinkPreview | null>('link_preview_resolve', { url })
    : await postJson<LinkPreview | null>('/link/preview', { url })
  if (!res.success) {
    void logFrontendError({
      level: 'warn',
      source: 'link-preview-api',
      // The URL can carry tokens/passcodes: log the host only.
      message: `link preview failed for host ${hostOf(url)}: ${res.code} ${res.error}`
    })
    return null
  }
  return res.data ?? null
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(invalid)'
  }
}

const MAX_ENTRIES = 300
const cache = new Map<string, LinkPreview | null>()
const inflight = new Map<string, Promise<LinkPreview | null>>()

/** The cached preview, `null` for a settled miss, `undefined` when unknown. */
export function peekLinkPreview(url: string): LinkPreview | null | undefined {
  return cache.get(url)
}

/**
 * Cached + de-duplicated {@link fetchLinkPreview}: one request per URL per
 * renderer session, however many chips show it.
 */
export function loadLinkPreview(url: string): Promise<LinkPreview | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)
  const pending = inflight.get(url)
  if (pending) return pending
  const request = fetchLinkPreview(url)
    .catch(() => null)
    .then((preview) => {
      inflight.delete(url)
      if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      cache.set(url, preview)
      return preview
    })
  inflight.set(url, request)
  return request
}

/** Test-only: forget every cached preview. */
export function clearLinkPreviewCache(): void {
  cache.clear()
  inflight.clear()
}
