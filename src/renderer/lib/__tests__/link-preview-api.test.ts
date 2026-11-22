import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch, mockIsTauriContext, mockInvoke } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockIsTauriContext: vi.fn(),
  mockInvoke: vi.fn()
}))

vi.mock('../tauri-runtime', () => ({ isTauriContext: mockIsTauriContext }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('../log-api', () => ({ logFrontendError: vi.fn(() => Promise.resolve()) }))

import { clearLinkPreviewCache, fetchLinkPreview, loadLinkPreview } from '../link-preview-api'

const URL_ = 'https://zoom.us/rec/share/abc'
const PREVIEW = {
  url: URL_,
  title: 'Zoom Recordings',
  siteName: 'Zoom',
  iconDataUri: 'data:image/png;base64,AA=='
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  clearLinkPreviewCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('link preview transport parity', () => {
  it('desktop invokes link_preview_resolve and unwraps the IpcResult', async () => {
    mockIsTauriContext.mockReturnValue(true)
    mockInvoke.mockResolvedValueOnce({ success: true, data: PREVIEW })
    await expect(fetchLinkPreview(URL_)).resolves.toEqual(PREVIEW)
    expect(mockInvoke).toHaveBeenCalledWith('link_preview_resolve', { url: URL_ })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('web posts /link/preview and unwraps the IpcBody', async () => {
    mockIsTauriContext.mockReturnValue(false)
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: PREVIEW }))
    await expect(fetchLinkPreview(URL_)).resolves.toEqual(PREVIEW)
    const [path, init] = mockFetch.mock.calls[0]
    expect(String(path)).toMatch(/\/link\/preview$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ url: URL_ })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('a failed call on either transport degrades to null (plain link)', async () => {
    mockIsTauriContext.mockReturnValue(true)
    mockInvoke.mockRejectedValueOnce(new Error('boom'))
    await expect(fetchLinkPreview(URL_)).resolves.toBeNull()
    mockIsTauriContext.mockReturnValue(false)
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    await expect(fetchLinkPreview(URL_)).resolves.toBeNull()
  })

  it('a null preview stays null', async () => {
    mockIsTauriContext.mockReturnValue(false)
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
    await expect(fetchLinkPreview(URL_)).resolves.toBeNull()
  })
})

describe('loadLinkPreview', () => {
  it('de-duplicates concurrent requests and caches the result', async () => {
    mockIsTauriContext.mockReturnValue(true)
    mockInvoke.mockResolvedValue({ success: true, data: PREVIEW })
    const [a, b] = await Promise.all([loadLinkPreview(URL_), loadLinkPreview(URL_)])
    expect(a).toEqual(PREVIEW)
    expect(b).toEqual(PREVIEW)
    await loadLinkPreview(URL_)
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })
})
