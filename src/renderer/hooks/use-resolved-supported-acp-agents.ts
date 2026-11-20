import { useCallback, useEffect, useState } from 'react'
import type { StoredAgentConfig } from '@/lib/acp-agents-persistence'
import {
  resolveSupportedAcpAgents,
  type SupportedAcpAgentEntry
} from '@/lib/agents/supported-acp-agents'

export interface SupportedAcpAgentCatalog {
  /** The last resolution; empty before the first one settles. */
  entries: readonly SupportedAcpAgentEntry[]
  /** True until the first resolution settles, and while a `recheck` runs. */
  checking: boolean
  /** Resolves again past the renderer's catalog cache ("Check again"). */
  recheck: () => void
}

/**
 * Resolve supported ACP agents from the host-resolved catalog (CAP-6 / Story 8).
 *
 * The host is the single source of truth for OS, arch, runtime availability,
 * and per-agent installability status — the renderer never probes
 * `@tauri-apps/plugin-os` or PATH locally. Re-resolves when
 * `persistedConfigs` changes (e.g. the user saves a new agent config so it is
 * projected as `ready`). A rejected resolution reads as no agents, so callers
 * fall back to their empty state instead of hanging.
 */
export function useSupportedAcpAgentCatalog(
  persistedConfigs: readonly StoredAgentConfig[]
): SupportedAcpAgentCatalog {
  const [entries, setEntries] = useState<readonly SupportedAcpAgentEntry[]>([])
  const [checking, setChecking] = useState(true)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    let cancelled = false
    setChecking(true)
    void resolveSupportedAcpAgents(persistedConfigs, { refresh: generation > 0 })
      .then((resolved) => {
        if (!cancelled) setEntries(resolved)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [persistedConfigs, generation])

  const recheck = useCallback(() => setGeneration((g) => g + 1), [])
  return { entries, checking, recheck }
}

/**
 * The resolved entries only. Empty until the first catalog resolution
 * completes, so callers can render an empty/loading state without flashing
 * the desktop-only `currentPlatformArch()` derivation.
 */
export function useResolvedSupportedAcpAgents(
  persistedConfigs: readonly StoredAgentConfig[]
): readonly SupportedAcpAgentEntry[] {
  return useSupportedAcpAgentCatalog(persistedConfigs).entries
}
