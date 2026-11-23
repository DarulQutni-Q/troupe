import { expect, test } from 'bun:test'
import { SURFACES } from '../surfaces'
import { AREA_WEIGHTS } from '../weights'

test('surface ids are unique', () => {
  const ids = SURFACES.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)
})

test('every surface has steps with unique names and a weighted area', () => {
  for (const surface of SURFACES) {
    const names = surface.steps.map((s) => s.name)
    expect({
      id: surface.id,
      steps: names.length > 0,
      unique: new Set(names).size === names.length
    }).toEqual({
      id: surface.id,
      steps: true,
      unique: true
    })
    expect(AREA_WEIGHTS[surface.area]).toBeGreaterThan(0)
  }
})
