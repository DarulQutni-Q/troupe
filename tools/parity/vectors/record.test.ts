import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  drawId,
  emit,
  type Manifest,
  manifestEntry,
  OUT_DIR,
  recordVector,
  type Scenario,
  type StoreRecorder,
  type Vector,
  vectorText,
  writeOut
} from './record'

const lib = '../../../src/renderer/lib'

vi.mock(`${lib}/log-api`, async (importOriginal) => ({
  ...(await importOriginal<object>()),
  logFrontendError: (payload: { level: string; source: string; message: string }) => {
    emit({ kind: 'log', level: payload.level, source: payload.source, message: payload.message })
    return Promise.resolve()
  }
}))

// `isChatRouteCurrent` answers yes, so a navigation the store asks to replace
// names the chat route it replaces.
let routeQuery: string | null = null
vi.mock(`${lib}/router-navigate`, async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isChatRouteCurrent: (sessionId: string) => {
    routeQuery = sessionId
    return true
  },
  navigateToChatSession: (sessionId: string, options?: { replace?: boolean }) => {
    emit({
      kind: 'navigateToChat',
      sessionId,
      ...(options?.replace && routeQuery ? { replaceIfOn: routeQuery } : {})
    })
    routeQuery = null
  },
  clearChatRoute: () => emit({ kind: 'clearChatRoute' })
}))

const { workspaceRecorder, workspaceScenarios } = await import('./stores/workspace')

const STORES: Array<[StoreRecorder, Scenario[]]> = [[workspaceRecorder, workspaceScenarios]]

const write = process.env.RECORD_VECTORS === '1'

describe('test vectors', () => {
  it('match what the TypeScript stores do today', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(drawId)
    const manifest: Manifest = { stores: {} }
    const vectors: Vector[] = []
    for (const [recorder, scenarios] of STORES) {
      const recorded: Vector[] = []
      for (const scenario of scenarios) recorded.push(await recordVector(recorder, scenario))
      manifest.stores[recorder.store] = manifestEntry(recorder, recorded)
      vectors.push(...recorded)
    }
    if (write) {
      writeOut(manifest, vectors)
      return
    }
    const onDisk = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8')) as Manifest
    expect(onDisk, 'out/manifest.json is stale: rerun with RECORD_VECTORS=1').toEqual(manifest)
    for (const vector of vectors) {
      const path = join(OUT_DIR, vector.store, `${vector.name}.json`)
      expect(existsSync(path), `${path} is missing`).toBe(true)
      expect(readFileSync(path, 'utf8'), `${path} is stale`).toBe(vectorText(vector))
    }
    const files = readdirSync(OUT_DIR, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.json')
    )
    expect(files.length, 'out/ holds vectors no scenario records').toBe(vectors.length + 1)
  })
})
