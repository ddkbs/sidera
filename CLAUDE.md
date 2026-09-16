# CanvasCL — Claude Code guide

Free, open-source, MCP-first visual knowledge base: whiteboards, card library, kanban, journal.
macOS only, local-first. Keep answers & diffs small; don't re-explore what this file already says.

## Commands
- `npm run dev` — electron-vite dev (HMR renderer)
- `npm test` — vitest, runs **inside Electron's Node** (`ELECTRON_RUN_AS_NODE`) because better-sqlite3 is built for Electron ABI
- `npm run typecheck` — tsc for node + web projects
- Done-criteria for any goal: `npm test && npm run typecheck` both green
- Add UI primitives via CLI: `npx shadcn@latest add <name>` (never hand-write shadcn components). Afterwards run `sed -i "" "s#from \"cn\"#from \"@/lib/utils\"#" src/renderer/src/components/ui/*.tsx` and `npm uninstall cn` — we use tailwind-merge via @/lib/utils
- After adding native deps: `npx electron-builder install-app-deps`

## Visual verification (no manual clicking)
Dev-only hook in `src/main/index.ts` (`devShot`). Steps separated by `\n---\n`; each step is renderer JS **or** `@click x y`, `@dblclick x y`, `@key meta+z`, `@type text` (CSS px). A PNG is written after every step.
```
CANVASCL_DATA_DIR=<scratch>/data CANVASCL_SHOT=<scratch>/s.png CANVASCL_SCRIPT=<scratch>/steps.js CANVASCL_QUIT=1 npx electron-vite dev
```
Navigate by writing `localStorage['canvascl.ui'] = {sidebarOpen, theme, view}` then `location.reload()`. Seed via `window.api.*`. Kill leftover `Electron .` processes if port 3845 is busy.

## Layout
- `src/shared/` — types (`types.ts`), IPC/API contract (`api.ts`), Tiptap↔Markdown (`doc.ts`). Pure, no Electron imports.
- `src/main/db/` — `migrations.ts` (append-only SQL, PRAGMA user_version) + `schema.ts` (Drizzle, keep in sync). FTS5 table `cards_fts` via triggers.
- `src/main/services/index.ts` — ALL business logic, synchronous, used by IPC **and** MCP. Call `onChange(scope)` after mutations.
- `src/main/ipc.ts` — generic: every `API_METHODS` entry → `ipcMain.handle('api:<name>')`.
- `src/main/mcp/` — MCP server (Streamable HTTP on 127.0.0.1:3845 while app runs; `--mcp-stdio` headless mode).
- `src/main/ai/chat.ts` — in-app Claude chat: manual streaming tool loop; tools = in-process MCP client over our own server (never duplicate tool definitions).
- `src/preload/` — exposes `window.api: CanvasApi` + `window.events`.
- `src/renderer/src/` — React. `store/` (RTK + RTK Query `api.ts` wrapping window.api), `features/<canvas|library|kanban|journal|palette|card>`, `components/ui` (shadcn), `components/layout`.

## Adding a feature (checklist)
1. Types in `shared/types.ts`, method in `shared/api.ts` (+ `API_METHODS`)
2. Migration (new array entry) + schema.ts if storage changes
3. Service impl + test in `tests/services.test.ts`
4. RTK Query endpoint in `renderer/src/store/api.ts` with tags
5. Optional MCP tool in `main/mcp/tools.ts`

## Conventions
- IDs: nanoid. Timestamps: ms epoch. JSON columns stored as TEXT.
- Card content = Tiptap JSON; mentions are node `cardMention {id,label}` → backlinks table.
- Ordering uses fractional `position` (`between()` in shared/util).
- UI: Tailwind v4 tokens in `index.css` (tweakcn-style CSS vars), Geist font, Lucide icons, Motion for animation, Sonner toasts. Clean Notion/ElevenLabs look — no Apple-native chrome.
- Canvas: @xyflow/react. Node types in `features/canvas/nodes/`. Positions persisted debounced via `updateObjects`.
