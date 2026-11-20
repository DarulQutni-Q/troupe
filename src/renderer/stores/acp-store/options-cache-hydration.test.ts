import { PersistenceKeys } from '@shared/types/persistence.types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sharedFake } from '@/lib/__tests__/shared-watch-fake'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))
vi.mock('@/lib/tauri-runtime', () => ({
  isTauriContext: vi.fn(() => true),
  cleanupTauriListener: vi.fn()
}))
vi.mock('@/lib/log-api', () => ({ logFrontendError: vi.fn() }))
vi.mock('@/lib/api', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/api')>()),
  persistenceApi: (await import('@/lib/__tests__/shared-watch-fake')).sharedFake.api
}))

import { useAcpStore } from '@/stores/acp-store'

const config = (id: string) => ({ id, name: id, command: 'agent', args: [], env: {} })

const SAVED = {
  models: null,
  modelOption: {
    id: 'model',
    name: 'Model',
    currentValue: 'opus',
    options: [
      { value: 'opus', name: 'Opus', description: null },
      { value: 'haiku', name: 'Haiku', description: 'Fast' }
    ]
  },
  updatedAt: 5
}

describe('saved model lists after a page load', () => {
  beforeEach(() => {
    sharedFake.reset(true)
    useAcpStore.setState({ agentOptionsCache: {} })
  })

  it("fills an agent's empty options cache from its saved model list", async () => {
    sharedFake.seed(PersistenceKeys.acpAgents, [config('cold')])
    sharedFake.seed(PersistenceKeys.agentModelCatalog('cold'), SAVED)

    await useAcpStore.getState().loadAgentConfigs()

    await vi.waitFor(() =>
      expect(useAcpStore.getState().agentOptionsCache.cold).toEqual({
        models: null,
        modes: null,
        configOptions: [
          {
            id: 'model',
            name: 'Model',
            category: 'model',
            type: 'select',
            currentValue: 'opus',
            options: [
              { value: 'opus', name: 'Opus', description: null },
              { value: 'haiku', name: 'Haiku', description: 'Fast' }
            ]
          }
        ],
        updatedAt: 5
      })
    )
  })

  it('keeps the options a live session wrote first', async () => {
    sharedFake.seed(PersistenceKeys.acpAgents, [config('warm')])
    sharedFake.seed(PersistenceKeys.agentModelCatalog('warm'), SAVED)
    const live = {
      models: {
        currentModelId: 'sonnet',
        availableModels: [{ modelId: 'sonnet', name: 'Sonnet' }]
      },
      modes: null,
      configOptions: [],
      updatedAt: 9
    }
    useAcpStore.setState({ agentOptionsCache: { warm: live } })

    await useAcpStore.getState().loadAgentConfigs()
    await vi.waitFor(() =>
      expect(sharedFake.api.read).toHaveBeenCalledWith(PersistenceKeys.agentModelCatalog('warm'))
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useAcpStore.getState().agentOptionsCache.warm).toEqual(live)
  })
})
