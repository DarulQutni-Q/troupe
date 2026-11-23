import type { Surface } from '../types'
import { resetAlpha } from '../world'
import { click, DASHBOARD, label, see, step, txt } from './dsl'

const openChanges = click(label('Changes'))

export const GIT: Surface[] = [
  {
    id: 'git.changes',
    area: 'git',
    title: 'Changes panel: staged, unstaged, untracked, history',
    prepare: resetAlpha,
    steps: [
      DASHBOARD,
      step('b-changes', [openChanges], see('app.ts', 'README.md', 'notes.txt', 'link the guide'))
    ]
  },
  {
    id: 'git.diff',
    area: 'git',
    title: 'Diff view of an unstaged file',
    prepare: resetAlpha,
    steps: [
      DASHBOARD,
      step('b-changes', [openChanges], see('README.md')),
      step('c-diff', [click(txt('README.md'))], see('An unstaged line.'))
    ]
  }
]
