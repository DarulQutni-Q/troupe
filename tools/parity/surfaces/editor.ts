import type { Surface } from '../types'
import { click, DASHBOARD, see, step, txt } from './dsl'
import { openExplorer } from './explorer'

export const EDITOR: Surface[] = [
  {
    id: 'editor.code',
    area: 'editor',
    title: 'Code editor on a TypeScript file',
    source: { screen: 'pane', name: 'editor' },
    steps: [
      DASHBOARD,
      step('b-tree', [openExplorer, click(txt('src'))], see('app.ts')),
      step('c-open', [click(txt('app.ts'))], see('export function greet'))
    ]
  },
  {
    id: 'editor.markdown',
    area: 'editor',
    title: 'Markdown editor',
    source: { journey: 'starter' },
    steps: [
      DASHBOARD,
      step('b-tree', [openExplorer, click(txt('docs'))], see('guide.md')),
      step('c-open', [click(txt('guide.md'))], see('Alpha guide', 'Setup'))
    ]
  }
]
