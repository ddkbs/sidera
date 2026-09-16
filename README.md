# CanvasCL

A free, open-source, local-first visual knowledge base — whiteboards, a card library with backlinks & tags, kanban/table/list views, a daily journal — and **MCP-first**: every core action is exposed as an MCP tool so AI agents (Claude Desktop, Claude Code, …) can read and organize your knowledge.

## Stack
Electron · electron-vite · React · TypeScript · Tailwind v4 · shadcn/ui · Redux Toolkit · Tiptap · SQLite (better-sqlite3 + Drizzle, FTS5) · React Flow · dnd-kit · cmdk · Motion · MCP SDK

## Develop
```bash
npm install
npm run dev
npm test && npm run typecheck
```

## MCP
While the app runs, an MCP server listens on `http://127.0.0.1:3845/mcp` (Streamable HTTP).
Headless stdio mode: `CanvasCL --mcp-stdio`. Tools: `search_cards`, `get_card`, `create_card`, `update_card`,
`list_cards`, `list_tags`, `tag_card`, `create_property`, `set_card_property`, `list_whiteboards`, `get_whiteboard`, `create_whiteboard`, `add_card_to_whiteboard`,
`add_section`, `connect_objects`, `get_kanban`, `move_kanban_item`, `get_journal`, `append_to_journal`.

## License
MIT
