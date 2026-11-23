import type { Surface } from '../types'
import { click, css, DASHBOARD, label, see, step, type } from './dsl'

const composer = click(css('[contenteditable="true"], textarea'))

export const COMPOSER: Surface[] = [
  {
    id: 'composer.mention',
    area: 'composer',
    title: 'Mention menu (@)',
    steps: [
      DASHBOARD,
      step('b-menu', [composer, type('@')], see('Conversations', 'Files and folders in alpha'))
    ]
  },
  {
    id: 'composer.slash',
    area: 'composer',
    title: 'Slash command menu (/)',
    steps: [DASHBOARD, step('b-menu', [composer, type('/')], see('Skills', '/matrix-review'))]
  },
  {
    id: 'composer.add-menu',
    area: 'composer',
    title: 'Add to chat menu',
    steps: [
      DASHBOARD,
      step('b-menu', [click(label('Add to chat'))], see('Add files or photos', 'Slash commands'))
    ]
  },
  {
    id: 'composer.connectors',
    area: 'composer',
    title: 'Connectors menu',
    steps: [
      DASHBOARD,
      step('b-menu', [click(label('Connectors, 0 on'))], see('MCP servers', 'Manage MCP servers'))
    ]
  }
]
