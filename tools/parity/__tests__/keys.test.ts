import { expect, test } from 'bun:test'
import { playwrightKeys } from '../drivers/react'
import { x11Keys } from '../drivers/x11'

test('playwrightKeys maps strokes to Playwright key names', () => {
  expect(playwrightKeys('ctrl-shift-k escape a')).toEqual(['Control+Shift+k', 'Escape', 'a'])
})

test('x11Keys maps a stroke to an X keysym combination', () => {
  expect(x11Keys('ctrl-shift-n')).toBe('Control_L+Shift_L+n')
  expect(x11Keys('enter')).toBe('Return')
  expect(x11Keys('alt-,')).toBe('Alt_L+comma')
})
