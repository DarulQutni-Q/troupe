import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppSettingsStore } from '@/stores/app-settings-store'
import { useProjectStore } from '@/stores/project-store'
import type { Project } from '@/types/project'
import { DEFAULT_APP_SETTINGS } from '@/types/settings'
import { decideOnboarding, type OnboardingFacts, useOnboardingGate } from './onboarding-gate'

const runtime = vi.hoisted(() => ({
  desktop: true,
  capability: { resolved: false, admitted: false },
  listeners: new Set<() => void>()
}))

vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: () => runtime.desktop,
  subscribeServerCapability: (listener: () => void) => {
    runtime.listeners.add(listener)
    return () => runtime.listeners.delete(listener)
  },
  getServerCapabilitySnapshot: () => () => runtime.capability
}))

const { mockLog } = vi.hoisted(() => ({ mockLog: vi.fn() }))
vi.mock('@/lib/log-api', () => ({ logFrontendError: mockLog }))

const firstRun: OnboardingFacts = {
  hostRead: 'missing',
  completedAt: null,
  projectsLoaded: true,
  projectCount: 0,
  writes: 'admitted'
}

describe('decideOnboarding', () => {
  it.each<[string, Partial<OnboardingFacts>, string]>([
    ['first run on a fresh host', {}, 'show'],
    ['a stored record without a completion', { hostRead: 'found' }, 'show'],
    ['a completed host', { hostRead: 'found', completedAt: '2026-11-20T08:00:00.000Z' }, 'skip'],
    ['a failed settings read', { hostRead: 'failed' }, 'skip'],
    ['an existing user with projects', { projectCount: 2 }, 'skip'],
    [
      'projects decide before the settings read or /health',
      { hostRead: 'pending', writes: 'pending', projectCount: 3 },
      'skip'
    ],
    ['a view-only shared-live client', { writes: 'refused' }, 'skip'],
    ['a /health that never answered', { writes: 'timed-out' }, 'skip'],
    ['the settings read still running', { hostRead: 'pending' }, 'pending'],
    ['projects still loading', { projectsLoaded: false }, 'pending'],
    ['write admission still unknown', { writes: 'pending' }, 'pending'],
    [
      'a completion is ignored until the read settles',
      { hostRead: 'pending', completedAt: '2026-11-20T08:00:00.000Z' },
      'pending'
    ]
  ])('%s', (_name, facts, expected) => {
    expect(decideOnboarding({ ...firstRun, ...facts })).toBe(expected)
  })
})

const project: Project = { id: 'p1', name: 'my-app', color: 'blue', path: '/code/my-app' }

describe('useOnboardingGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runtime.desktop = true
    runtime.capability = { resolved: false, admitted: false }
    useAppSettingsStore.setState({
      settings: { ...DEFAULT_APP_SETTINGS },
      isLoaded: true,
      hostRead: 'missing'
    })
    useProjectStore.setState({ projects: [], isLoaded: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays on onboarding after the flow adds the first project', () => {
    const { result } = renderHook(() => useOnboardingGate())
    expect(result.current.state).toBe('show')

    act(() => useProjectStore.setState({ projects: [project] }))

    expect(result.current.state).toBe('show')
  })

  it('stays closed after close, and after the last project is removed', () => {
    useProjectStore.setState({ projects: [project] })
    const { result } = renderHook(() => useOnboardingGate())
    expect(result.current.state).toBe('skip')

    act(() => useProjectStore.setState({ projects: [] }))
    expect(result.current.state).toBe('skip')
  })

  it('close leaves a showing gate for good', () => {
    const { result } = renderHook(() => useOnboardingGate())
    act(() => result.current.close())

    expect(result.current.state).toBe('skip')
  })

  it('waits for write admission on the web, then shows when /health admits writes', () => {
    runtime.desktop = false
    const { result } = renderHook(() => useOnboardingGate())
    expect(result.current.state).toBe('pending')

    act(() => {
      runtime.capability = { resolved: true, admitted: true }
      for (const listener of runtime.listeners) listener()
    })

    expect(result.current.state).toBe('show')
  })

  it('skips with a warning when write admission is unknown for 5 s', () => {
    vi.useFakeTimers()
    runtime.desktop = false
    const { result } = renderHook(() => useOnboardingGate())

    act(() => vi.advanceTimersByTime(4999))
    expect(result.current.state).toBe('pending')
    act(() => vi.advanceTimersByTime(1))

    expect(result.current.state).toBe('skip')
    expect(mockLog).toHaveBeenCalledWith({
      level: 'warn',
      source: 'onboarding',
      message: 'Write admission still unknown after 5000 ms; skipping first run'
    })
  })
})
