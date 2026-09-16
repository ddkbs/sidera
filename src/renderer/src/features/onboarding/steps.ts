export interface TourStep {
  id: string
  title: string
  body: string
  /** matches the element's `data-tour` attribute; omit for a centered step */
  target?: string
  /** navigate to the first whiteboard before measuring this step's target */
  needsWhiteboard?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CanvasCL',
    body: 'A quick tour of the essentials — whiteboards, tabs, the assistant and MCP. Takes about a minute.'
  },
  {
    id: 'sidebar',
    title: 'Everything lives in the sidebar',
    body: 'Jump between Home, your Journal, the Card Library, whiteboards and tags — all your knowledge in one tree.',
    target: 'sidebar-nav'
  },
  {
    id: 'tabs',
    title: 'Tabs, like a browser',
    body: 'Open multiple whiteboards or views side by side. ⌘-click any item to open it in a new tab.',
    target: 'tab-bar'
  },
  {
    id: 'toolbar',
    title: 'The whiteboard toolbar',
    body: 'Add cards, text, sections, connectors and diagrams. The ••• menu has nested whiteboards, mindmaps and auto-layout.',
    target: 'canvas-toolbar',
    needsWhiteboard: true
  },
  {
    id: 'search',
    title: 'Search anything, fast',
    body: 'Press ⌘K to search cards and whiteboards, or run a command — new card, new whiteboard, export, and more.',
    target: 'sidebar-search'
  },
  {
    id: 'ask-ai',
    title: 'Ask AI',
    body: 'Chat with an assistant that can read and edit your knowledge base — the same tools an external MCP agent uses.',
    target: 'ask-ai'
  },
  {
    id: 'settings',
    title: 'Settings & MCP',
    body: 'Connect Claude Desktop or Claude Code in one click from Settings → MCP & Claude — your local knowledge base becomes an agent tool.',
    target: 'settings-gear'
  },
  {
    id: 'done',
    title: "You're all set",
    body: 'Open the Welcome whiteboard any time for a refresher, or press ⌘/ to see every keyboard shortcut.'
  }
]
