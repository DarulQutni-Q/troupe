import type { Surface } from '../types'
import { click, DASHBOARD, id, label, see, step, wait } from './dsl'

export const TERMINAL: Surface[] = [
  {
    id: 'terminal.new-tab-menu',
    area: 'terminal',
    title: 'New tab menu',
    source: { overlay: ['components/workspace/NewTabMenu.tsx'] },
    steps: [
      DASHBOARD,
      step('b-menu', [click(id('new-tab-menu-trigger'))], see('New terminal with'))
    ]
  },
  {
    id: 'terminal.open',
    area: 'terminal',
    title: 'Open a terminal from the tool strip',
    source: { screen: 'pane', name: 'terminal' },
    steps: [
      DASHBOARD,
      step('b-open', [click(label('New terminal')), wait(2500)], see('Terminal 1', 'main'))
    ]
  }
]
