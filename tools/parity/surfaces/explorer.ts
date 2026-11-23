import type { Surface } from '../types'
import { click, DASHBOARD, label, rclick, see, step, txt } from './dsl'

export const openExplorer = click(label('Explorer'))

export const EXPLORER: Surface[] = [
  {
    id: 'explorer.tree',
    area: 'explorer',
    title: 'File tree',
    source: { screen: 'side-panel', name: 'explorer' },
    steps: [DASHBOARD, step('b-tree', [openExplorer], see('src', 'docs', 'README.md', 'notes.txt'))]
  },
  {
    id: 'explorer.expand',
    area: 'explorer',
    title: 'Expand a folder',
    source: { journey: 'starter' },
    steps: [
      DASHBOARD,
      step('b-tree', [openExplorer], see('src')),
      step('c-expanded', [click(txt('src'))], see('app.ts', 'utils.ts'))
    ]
  },
  {
    id: 'explorer.context-menu',
    area: 'explorer',
    title: 'File context menu',
    source: { overlay: ['components/file-explorer/FileTreeContextMenu.tsx'] },
    steps: [
      DASHBOARD,
      step('b-tree', [openExplorer], see('README.md')),
      step('c-menu', [rclick(txt('README.md'))], see('Rename', 'Delete'))
    ]
  }
]
