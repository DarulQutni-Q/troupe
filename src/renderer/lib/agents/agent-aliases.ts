/**
 * Legacy ACP registry ids that name the same agent as a canonical id.
 *
 * `opencode-v2` was a separate opt-in while `opencode` was 1.x
 * (agentclientprotocol/registry#657). Both ids now ship the same OpenCode 2
 * binary. The registry keeps `opencode-v2` so old saved ids still resolve
 * (registry#764 names it "OpenCode (legacy ID)"). Troupe lists only `opencode`.
 *
 * Reuse, do not migrate. A saved config, chat, history session, or install
 * that still says `opencode-v2` resolves to OpenCode at read time. The files
 * on disk stay as they are: this module never deletes or rewrites them. An
 * `opencode` install wins when both installs exist. When only `opencode-v2`
 * is installed, that binary is the OpenCode install.
 *
 * The map is `src/shared/acp-agent-aliases.json`. The Rust catalog reads the
 * same file. Do not add a second id check beside this module.
 */

import aliasMap from '@shared/acp-agent-aliases.json'

const REGISTRY_PREFIX = 'acp-registry:'

/** Legacy id → canonical id. */
export const AGENT_ALIASES: Readonly<Record<string, string>> = aliasMap

function bareAgentId(id: string): string {
  return id.startsWith(REGISTRY_PREFIX) ? id.slice(REGISTRY_PREFIX.length) : id
}

/** The canonical registry id for `id`. A config id loses its prefix. */
export function canonicalAgentId(id: string): string {
  const bare = bareAgentId(id)
  return AGENT_ALIASES[bare] ?? bare
}

/** True when `id` is a legacy alias, with or without the `acp-registry:` prefix. */
export function isLegacyAgentId(id: string): boolean {
  return Object.hasOwn(AGENT_ALIASES, bareAgentId(id))
}

/** Legacy ids that resolve to `canonicalId`. */
export function legacyAgentIds(canonicalId: string): string[] {
  const bare = bareAgentId(canonicalId)
  return Object.entries(AGENT_ALIASES)
    .filter(([, canonical]) => canonical === bare)
    .map(([alias]) => alias)
}

/** True when both ids name the same agent, including a legacy alias. */
export function sameAgentId(a: string, b: string): boolean {
  return canonicalAgentId(a) === canonicalAgentId(b)
}

/**
 * The config a saved id should launch. An exact id wins, so an old
 * `opencode-v2` config keeps its command. When that id is gone, the canonical
 * config is used. The list is not changed.
 */
export function findStoredAgentConfig<T extends { id: string }>(
  configs: readonly T[],
  id: string
): T | undefined {
  const exact = configs.find((config) => config.id === id)
  if (exact) return exact
  if (!isLegacyAgentId(id)) return undefined
  return configs.find((config) => sameAgentId(config.id, id))
}
