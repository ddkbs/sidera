import { APP_NAME } from '@shared/brand'
import type { Side } from './geometry'

export interface TourStep {
  id: string
  title: string
  body: string
  /** matches the element's `data-tour` attribute; omit for a centered step */
  target?: string
  /** preferred side for the popover (falls back to whatever fits) */
  placement?: Side
  /** extra space around the target in the cutout */
  padding?: number
  /** what the UI needs before the target can exist */
  needs?: 'sidebar' | 'whiteboard'
  /** command ids from lib/shortcuts.ts whose (user-customisable) bindings are shown as key hints */
  shortcuts?: string[]
  /** literal key hints shown after the shortcuts (e.g. a canvas tool letter) */
  keys?: { label: string; keys: string }[]
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'search',
    title: 'Find anything in a second',
    body: 'Search every card and whiteboard, or run a command — new card, new whiteboard, settings. It’s the fastest way around.',
    target: 'sidebar-search',
    needs: 'sidebar',
    shortcuts: ['palette.open']
  },
  {
    id: 'hub',
    title: 'Your Hub',
    body: 'Whiteboards and folders live here. Use + to create a whiteboard or folder, drag items to reorganize, and right-click for more.',
    target: 'hub',
    needs: 'sidebar',
    padding: 4
  },
  {
    id: 'canvas',
    title: 'Think on the canvas',
    body: 'Add cards, text, sections and connectors from this toolbar. Double-click empty space for a quick card, then drag from a card’s edge to connect it to another.',
    target: 'canvas-toolbar',
    placement: 'right',
    needs: 'whiteboard',
    keys: [
      { label: 'Card', keys: 'C' },
      { label: 'Connector', keys: 'A' }
    ]
  },
  {
    id: 'library',
    title: 'Every card, one library',
    body: 'Cards live on as many whiteboards as you like. Tag them to get a table with properties or a kanban board — perfect for projects and reading lists.',
    target: 'nav-library',
    needs: 'sidebar'
  },
  {
    id: 'tasks',
    title: 'Tasks from all your cards',
    body: 'To-dos written in any card show up here, with status, priority, assignee and due date.',
    target: 'nav-tasks',
    needs: 'sidebar',
    shortcuts: ['nav.tasks']
  },
  {
    id: 'tabs',
    title: 'Tabs, undo and history',
    body: '⌘-click anything to open it in a new tab. Every change can be undone, and you can step back and forward like in a browser.',
    target: 'tab-bar',
    placement: 'bottom',
    padding: 2,
    shortcuts: ['edit.undo', 'nav.back']
  },
  {
    id: 'ai',
    title: 'Ask AI',
    body: 'Chat with an assistant that can search, write and rearrange your cards and whiteboards. Bring your own API key in Settings.',
    target: 'ask-ai',
    needs: 'sidebar',
    shortcuts: ['chat.toggle']
  },
  {
    id: 'mcp',
    title: 'Connect Claude via MCP',
    body: `${APP_NAME} runs a local MCP server, so Claude Desktop, Claude Code and other agents can work with your knowledge base. Connect them in one click under Settings → MCP & Claude.`,
    target: 'account',
    needs: 'sidebar',
    shortcuts: ['settings.open']
  },
  {
    id: 'done',
    title: 'You’re all set',
    body: 'Replay this tour any time from the account menu or the command palette. Every keyboard shortcut is one keystroke away.',
    shortcuts: ['shortcuts.open']
  }
]
