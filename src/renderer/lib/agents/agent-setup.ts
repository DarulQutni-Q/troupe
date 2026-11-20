import type { StoredAgentConfig } from '@/lib/acp-agents-persistence'
import { acpApi } from '@/lib/acp-api'
import {
  installedBinaryConfig,
  type SupportedAcpAgentEntry,
  type SupportedAcpAgentInstall,
  type SupportedAcpAgentManagedInstall
} from '@/lib/agents/supported-acp-agents'
import { logFrontendError } from '@/lib/log-api'
import { useAcpStore } from '@/stores/acp-store'

/** Where to get the runtime a `needs-runtime` agent is missing. */
export const RUNTIME_HELP_URLS = {
  npx: 'https://nodejs.org/en/download',
  uvx: 'https://docs.astral.sh/uv/getting-started/installation/'
} as const satisfies Record<'npx' | 'uvx', string>

/** An entry the host can install: it carries an install spec. */
export type InstallableAgentEntry = SupportedAcpAgentEntry & {
  install: SupportedAcpAgentInstall | SupportedAcpAgentManagedInstall
}

export function isInstallable(entry: SupportedAcpAgentEntry): entry is InstallableAgentEntry {
  return entry.install !== null
}

const runningInstalls = new Map<string, Promise<StoredAgentConfig>>()

/**
 * Host-owned verified install (CAP-6 / Story 9: the request is the agent id
 * only), then the launch config from the outcome, saved to the ACP store.
 * Resolves the saved config; rejects with the host's error and saves nothing.
 * A second call for the same agent while one runs joins it, so two surfaces
 * never start two host installs. Selection, toasts and fallbacks stay with
 * the caller.
 */
export function installSupportedAgent(entry: InstallableAgentEntry): Promise<StoredAgentConfig> {
  const agentId = entry.agent.id
  const running = runningInstalls.get(agentId)
  if (running) return running
  const run = hostInstall(entry).finally(() => runningInstalls.delete(agentId))
  runningInstalls.set(agentId, run)
  return run
}

async function hostInstall(entry: InstallableAgentEntry): Promise<StoredAgentConfig> {
  try {
    const installed = await acpApi.installAcpAgent(entry.agent.id)
    const config = installedBinaryConfig(
      entry.agent,
      installed,
      entry.install.kind === 'archive' ? { env: entry.install.env } : {}
    )
    await useAcpStore.getState().saveAgentConfig(config)
    return config
  } catch (err) {
    void logFrontendError({
      level: 'warn',
      source: 'agents.install',
      message: `Install of ${entry.agent.id} failed: ${String(err)}`
    })
    throw err
  }
}

/**
 * Saves a ready entry's launch config when it is only catalog-derived and
 * returns the config id a chat starts on. The web client ignores unsaved
 * catalog defaults (#840, #907), so an explicit pick is saved first. Saving
 * an already-saved config is skipped.
 */
export async function saveSupportedAgentConfig(entry: SupportedAcpAgentEntry): Promise<string> {
  const config = entry.config
  if (!config) return entry.configId
  const store = useAcpStore.getState()
  if (!store.agentConfigs.some((saved) => saved.id === config.id)) {
    await store.saveAgentConfig(config)
  }
  return config.id
}
