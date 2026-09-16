import type { AppSettings, SettingsPatch } from './settings'
import type {
  Card,
  CardDetail,
  CardSummary,
  Connection,
  DocJSON,
  FileRecord,
  ID,
  JournalDay,
  KanbanBoard,
  ObjectKind,
  ObjectPatch,
  PropertyType,
  SearchHit,
  SelectOption,
  Tag,
  TagProperty,
  Task,
  Whiteboard,
  WhiteboardDetail,
  WhiteboardObject
} from './types'

/**
 * The single contract between renderer and main. Every method maps 1:1 to an
 * IPC channel `api:<name>` and to a service function in main. MCP tools call
 * the same services.
 */
export interface CanvasApi {
  // cards
  listCards(opts?: { tagId?: ID; limit?: number; offset?: number }): Promise<CardSummary[]>
  getCard(id: ID): Promise<CardDetail | null>
  createCard(input: { title?: string; content?: DocJSON; markdown?: string; tagIds?: ID[] }): Promise<Card>
  updateCard(input: { id: ID; title?: string; content?: DocJSON; color?: string | null; icon?: string | null }): Promise<Card>
  deleteCard(id: ID): Promise<void>

  // tags & properties
  listTags(): Promise<Tag[]>
  createTag(input: { name: string; color?: string }): Promise<Tag>
  updateTag(input: { id: ID; name?: string; color?: string }): Promise<Tag>
  deleteTag(id: ID): Promise<void>
  setCardTags(cardId: ID, tagIds: ID[]): Promise<void>
  listProperties(tagId: ID): Promise<TagProperty[]>
  createProperty(input: { tagId: ID; name: string; type: PropertyType; options?: SelectOption[] }): Promise<TagProperty>
  updateProperty(input: { id: ID; name?: string; options?: SelectOption[] }): Promise<TagProperty>
  setPropertyValue(cardId: ID, propertyId: ID, value: unknown): Promise<void>

  // kanban
  getKanban(tagId: ID, propertyId?: ID): Promise<KanbanBoard | null>
  moveKanbanItem(input: { cardId: ID; propertyId: ID; optionId: string | null; index: number }): Promise<void>

  // whiteboards
  listWhiteboards(): Promise<Whiteboard[]>
  getWhiteboard(id: ID): Promise<WhiteboardDetail | null>
  createWhiteboard(input: { name: string; parentId?: ID | null }): Promise<Whiteboard>
  updateWhiteboard(input: { id: ID; name?: string; viewport?: Whiteboard['viewport'] }): Promise<Whiteboard>
  deleteWhiteboard(id: ID): Promise<void>
  addObject(input: {
    whiteboardId: ID
    kind: ObjectKind
    refId?: ID | null
    x: number
    y: number
    width?: number
    height?: number
    color?: string | null
    data?: Record<string, unknown>
  }): Promise<WhiteboardObject>
  updateObjects(patches: ObjectPatch[]): Promise<void>
  removeObjects(ids: ID[]): Promise<void>
  /** Re-insert previously removed objects/connections with their original ids (undo). */
  restoreObjects(objects: WhiteboardObject[], connections: Connection[]): Promise<void>
  addConnection(input: { whiteboardId: ID; sourceId: ID; targetId: ID; label?: string }): Promise<Connection>
  updateConnection(input: { id: ID; label?: string; data?: Record<string, unknown> }): Promise<void>
  removeConnections(ids: ID[]): Promise<void>

  // journal
  getJournal(date: string): Promise<JournalDay>
  listJournal(limit?: number): Promise<JournalDay[]>

  // tasks
  listTasks(opts?: { status?: 'open' | 'done' | 'all' }): Promise<Task[]>
  setTaskChecked(cardId: ID, index: number, checked: boolean): Promise<void>

  // search
  search(query: string, limit?: number): Promise<SearchHit[]>

  // files
  importFiles(paths?: string[]): Promise<FileRecord[]>
  getFileUrl(id: ID): Promise<string | null>

  // markdown export / import (opens native folder / file pickers)
  exportMarkdown(): Promise<{ count: number; dir: string } | null>
  importMarkdown(): Promise<{ count: number }>

  // meta
  getMcpInfo(): Promise<{ running: boolean; url: string | null; stdioCommand: string }>
}

export type ApiMethod = keyof CanvasApi

export const API_METHODS: ApiMethod[] = [
  'listCards', 'getCard', 'createCard', 'updateCard', 'deleteCard',
  'listTags', 'createTag', 'updateTag', 'deleteTag', 'setCardTags',
  'listProperties', 'createProperty', 'updateProperty', 'setPropertyValue',
  'getKanban', 'moveKanbanItem',
  'listWhiteboards', 'getWhiteboard', 'createWhiteboard', 'updateWhiteboard', 'deleteWhiteboard',
  'addObject', 'updateObjects', 'removeObjects', 'restoreObjects', 'addConnection', 'updateConnection', 'removeConnections',
  'getJournal', 'listJournal',
  'listTasks', 'setTaskChecked',
  'search',
  'importFiles', 'getFileUrl',
  'exportMarkdown', 'importMarkdown',
  'getMcpInfo'
]

/** Event pushed from main to renderer whenever data changed outside the renderer (e.g. via MCP). */
export const DB_CHANGED = 'db:changed'
export type DbChangeScope = 'cards' | 'tags' | 'whiteboards' | 'journal' | 'all'

/** Event pushed to the renderer for every MCP tool call. */
export const MCP_ACTIVITY = 'mcp:activity'
export interface McpActivity {
  tool: string
  args: string
  at: number
}

/** Streaming events from the in-app chat agent. */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export const CHAT_EVENT = 'chat:event'

/** Chat bridge (separate from CanvasApi because it streams). */
export interface ChatBridge {
  send(text: string): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  hasKey(): Promise<boolean>
  setKey(key: string | null): Promise<void>
  onEvent(cb: (e: ChatEvent) => void): () => void
}

export interface DataInfo {
  dataDir: string
  dbPath: string
  filesDir: string
  dbBytes: number
  fileCount: number
  version: string
}

export interface McpConnections {
  desktop: boolean
  /** null = Claude Code CLI not installed */
  code: boolean | null
  httpUrl: string | null
  stdio: { command: string; args: string[]; env: Record<string, string> }
}

/** App-level bridge: settings, data location, integrations. */
export interface AppBridge {
  getSettings(): Promise<AppSettings>
  setSettings(patch: SettingsPatch): Promise<AppSettings>
  onSettingsChanged(cb: (s: AppSettings) => void): () => void
  getDataInfo(): Promise<DataInfo>
  revealDataDir(): Promise<void>
  getMcpConnections(): Promise<McpConnections>
  connectClaude(target: 'desktop' | 'code'): Promise<{ ok: boolean; message: string }>
  /** Quick-capture window (see src/main/capture.ts). */
  openCapture(): Promise<void>
  hideCapture(): Promise<void>
}
