import { APP_NAME } from '@shared/brand'
import type { Side } from './geometry'

export interface TourStep {
  id: string
  title: string
  body: string
  /** shown instead of `body` when the target can't be found (e.g. no whiteboard exists yet) */
  fallbackBody?: string
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
    id: 'home',
    title: 'Home: your boards',
    body: 'Recent boards with a live preview. Start a New board, or jot down a Quick note — every board also lives in the sidebar.',
    target: 'nav-home',
    needs: 'sidebar',
    padding: 4
  },
  {
    id: 'write',
    title: 'Write anywhere',
    body: 'Double-click empty space on a board and just type — a text block appears right there. Or pick the text block tool.',
    fallbackBody: 'Create a board from Home or with ⌘K, then double-click anywhere on it and just type — a text block appears right there.',
    target: 'tool-block',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['tool.block', 'canvas.newTextBlock']
  },
  {
    id: 'pen',
    title: 'Draw on the board',
    body: 'Switch to the pen and underline, circle or sketch straight onto the board. Esc puts the pen away.',
    fallbackBody: 'On a board, press P to draw straight onto it — underline, circle or sketch. Esc puts the pen away.',
    target: 'tool-pen',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['tool.pen']
  },
  {
    id: 'insert',
    title: 'Tables, charts & more',
    body: 'Insert tables, charts, timelines, mindmaps and files from here. Select a table → Create chart, and the chart follows its numbers.',
    target: 'canvas-insert',
    placement: 'right',
    needs: 'whiteboard'
  },
  {
    id: 'ipad',
    title: 'Draw on your iPad',
    body: `“Draw on iPad…” in the same menu shows a QR code: scan it and sketch with Apple Pencil in ${APP_NAME} Draw. End-to-end encrypted, over your own Wi-Fi.`,
    target: 'canvas-insert',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['canvas.drawOnIpad']
  },
  {
    id: 'search',
    title: 'Find anything in a second',
    body: 'Search every board and note, or run a command — new board, settings, draw on iPad. It’s the fastest way around.',
    target: 'sidebar-search',
    needs: 'sidebar',
    shortcuts: ['palette.open']
  },
  {
    id: 'ai',
    title: 'Ask AI — or bring Claude',
    body: `Chat with an assistant that can read and build your boards (bring your own API key). ${APP_NAME} also runs a local MCP server for Claude Desktop and Claude Code — connect under Settings → MCP & Claude.`,
    target: 'ask-ai',
    needs: 'sidebar',
    shortcuts: ['chat.toggle', 'settings.open']
  },
  {
    id: 'more',
    title: 'More: cards & tasks',
    body: 'Prefer structured notes? The Card Library (tags, backlinks, kanban) and Tasks live under More.',
    target: 'nav-library',
    needs: 'sidebar'
  },
  {
    id: 'done',
    title: 'You’re all set',
    body: 'Replay this tour any time from the account menu or the command palette. Every keyboard shortcut is one keystroke away.',
    shortcuts: ['shortcuts.open']
  }
]
