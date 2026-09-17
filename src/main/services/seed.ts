import type { Services } from './index'

/** Creates a welcome whiteboard on first launch (empty database only). Returns true if seeded. */
export function seedWelcome(api: Services): boolean {
  if (api.listWhiteboards().length || api.listCards({ limit: 1 }).length) return false

  const tag = api.createTag({ name: 'Getting started', color: 'blue' })
  const board = api.createWhiteboard({ name: 'Welcome to CanvasCL' })
  const w = board.id

  api.addObject({ whiteboardId: w, kind: 'text', x: 0, y: -170, width: 620, height: 56, data: { text: 'Welcome to CanvasCL 👋', size: 36 } })
  api.addObject({ whiteboardId: w, kind: 'section', x: -40, y: -60, width: 1120, height: 380, color: 'blue', data: { title: 'Basics' } })

  const cards = [
    {
      title: 'Cards are your notes',
      markdown: 'Double-click a card to edit it right here. Use the ⤢ button to open it in the side panel.\n\nType **@** to link another card — it shows up as a backlink.',
      x: 0
    },
    {
      title: 'Whiteboards arrange ideas',
      markdown: '- Double-click empty space → new card\n- The chart button adds charts, timelines & mindmaps\n- Sections group and move cards together\n- ⌘Z / ⇧⌘Z undo and redo',
      x: 360
    },
    {
      title: 'Tags become databases',
      markdown: 'Tag a card, then open the tag in the sidebar to see a **table** with properties or a **kanban** board.',
      x: 720
    }
  ].map((c) => {
    const card = api.createCard({ title: c.title, markdown: c.markdown, tagIds: [tag.id] })
    return { card, obj: api.addObject({ whiteboardId: w, kind: 'card', refId: card.id, x: c.x, y: 0, width: 320, height: 250 }) }
  })
  api.addConnection({ whiteboardId: w, sourceId: cards[0].obj.id, targetId: cards[1].obj.id })
  api.addConnection({ whiteboardId: w, sourceId: cards[1].obj.id, targetId: cards[2].obj.id })

  const mcp = api.createCard({
    title: 'Let AI agents help (MCP)',
    markdown:
      'CanvasCL runs a local MCP server. Connect Claude Code with:\n\n```\nclaude mcp add --transport http canvascl http://127.0.0.1:3845/mcp\n```\n\nThen ask it to *search my cards*, *create a card*, or *move items on my kanban*.',
    tagIds: [tag.id]
  })
  api.addObject({ whiteboardId: w, kind: 'card', refId: mcp.id, x: 1180, y: 0, width: 360, height: 320 })
  api.addObject({ whiteboardId: w, kind: 'mindmap', x: 0, y: 400, width: 520, height: 300, data: { source: 'CanvasCL\n  - Cards\n    - Backlinks\n  - Whiteboards\n    - Sections\n  - Tags\n    - Table\n    - Kanban' } })
  return true
}
