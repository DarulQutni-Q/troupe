import type { Surface } from '../types'
import { ensureProject } from '../world'
import { AGENT_PICKED, click, css, DASHBOARD, gone, id, label, rclick, see, step, txt } from './dsl'

const betaMenu = rclick(id('project-item-matrix-beta'))

export const RAIL: Surface[] = [
  {
    id: 'rail.project-list',
    area: 'rail',
    title: 'Project list and switching',
    roi: '[data-testid="shell-rail"]',
    steps: [
      step(
        'a-dashboard',
        [],
        [...see('alpha', 'beta', 'gamma', 'delta', 'What should we do in alpha?'), AGENT_PICKED]
      ),
      step(
        'b-switch-beta',
        [click(id('project-item-matrix-beta'))],
        [...see('What should we do in beta?'), AGENT_PICKED]
      )
    ]
  },
  {
    id: 'rail.project-menu',
    area: 'rail',
    title: 'Project context menu',
    roi: '[role="menu"]',
    steps: [DASHBOARD, step('b-menu', [betaMenu], see('Rename', 'Change color', 'Move to group'))]
  },
  {
    id: 'rail.project-colour',
    area: 'rail',
    title: 'Project colour picker',
    prepare: (world) => ensureProject(world, 'beta'),
    steps: [
      DASHBOARD,
      step('b-picker', [betaMenu, click(txt('Change color'))], see('Select Color'))
    ]
  },
  {
    id: 'rail.project-settings',
    area: 'rail',
    title: 'Project settings modal',
    steps: [
      DASHBOARD,
      step(
        'b-settings',
        [betaMenu, click(label('Settings', 'menuitem'))],
        see('Basic project identification and location.')
      )
    ]
  },
  {
    id: 'rail.new-project',
    area: 'rail',
    title: 'Add project menu and new project modal',
    steps: [
      DASHBOARD,
      step('b-menu', [click(label('Add project or folder group'))], see('New project')),
      step(
        'c-modal',
        [click(txt('New project', false))],
        see('Create New Project', 'Root Directory')
      )
    ]
  },
  {
    id: 'rail.chat-menu',
    area: 'rail',
    title: 'Chat row menu',
    steps: [
      DASHBOARD,
      step(
        'b-menu',
        [click(css('button[aria-label^="More actions for How does"]'))],
        see('Copy chat ID', 'Delete chat')
      )
    ]
  },
  {
    id: 'rail.collapse',
    area: 'rail',
    title: 'Collapse the rail',
    steps: [
      DASHBOARD,
      step('b-collapsed', [click(label('Expand or collapse projects'))], [gone('Automations')])
    ]
  }
]
