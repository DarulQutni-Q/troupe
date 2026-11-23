import type { Surface } from '../types'
import { click, DASHBOARD, gone, id, openChat, see, step, wait } from './dsl'

export const CHAT: Surface[] = [
  {
    id: 'chat.transcript',
    area: 'chat',
    title: 'Open a chat: transcript, tool cards, result',
    roi: '[data-slot="message-scroller-viewport"]',
    steps: [
      DASHBOARD,
      step(
        'b-open',
        [openChat, wait(1500)],
        [
          ...see('Where else is the chat route parsed?', 'One more place parses it'),
          // The scroller's button text: gone once the transcript rests at its end.
          gone('Scroll to latest')
        ]
      )
    ]
  },
  {
    id: 'chat.agent-launcher',
    area: 'chat',
    title: 'Agent and model menu',
    steps: [
      DASHBOARD,
      step(
        'b-menu',
        [click(id('agent-model-selector-trigger'))],
        see('This agent gives no model choice.')
      )
    ]
  }
]
