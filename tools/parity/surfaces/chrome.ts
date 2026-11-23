import type { Surface } from '../types'
import { click, DASHBOARD, label, see, step } from './dsl'

/** The rail footer and the command palette. */
export const CHROME: Surface[] = [
  {
    id: 'theme.picker',
    area: 'theme',
    title: 'Colour theme picker',
    steps: [
      DASHBOARD,
      step('b-picker', [click(label('Color themes'))], see('Color Themes', 'Catppuccin Light'))
    ]
  },
  {
    id: 'shortcuts.menu',
    area: 'shortcuts',
    title: 'Keyboard shortcuts menu',
    steps: [
      DASHBOARD,
      step(
        'b-menu',
        [click(label('Open keyboard shortcuts menu'))],
        see('Shortcut Menu', 'Command Palette')
      )
    ]
  },
  {
    id: 'palette.open',
    area: 'palette',
    title: 'Command palette from Search',
    steps: [
      DASHBOARD,
      step(
        'b-open',
        [click(label('Search'))],
        see('New Terminal', 'Open a new shell in the active pane')
      )
    ]
  }
]
