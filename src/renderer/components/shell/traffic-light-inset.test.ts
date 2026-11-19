import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRAFFIC_LIGHT_CLEARANCE_PX } from './traffic-light-inset'

const TAURI_DIR = join(__dirname, '..', '..', '..', '..', 'src-tauri')

describe('TRAFFIC_LIGHT_CLEARANCE_PX', () => {
  it('clears the lights (x = 22..74) plus the 4px gap to the mark', () => {
    expect(TRAFFIC_LIGHT_CLEARANCE_PX).toBe(78)
  })

  it('matches the native light position in both window configs', () => {
    for (const file of ['tauri.conf.json', 'tauri.macos.conf.json']) {
      const config = readFileSync(join(TAURI_DIR, file), 'utf-8')
      expect(config).toMatch(/"trafficLightPosition":\s*\{\s*"x":\s*22,/)
    }
  })
})
