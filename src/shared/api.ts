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
  updateCard(input: { id: ID; title?: string; content?: DocJSON }): Promise<Card>
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
  addConnection(input: { whiteboardId: ID; sourceId: ID; targetId: ID; label?: string }): Promise<Connection>
  updateConnection(input: { id: ID; label?: string; data?: Record<string, unknown> }): Promise<void>
  removeConnections(ids: ID[]): Promise<void>

  // journal
  getJournal(date: string): Promise<JournalDay>
  listJournal(limit?: number): Promise<JournalDay[]>

  // search
  search(query: string, limit?: number): Promise<SearchHit[]>

  // files
  importFiles(paths?: string[]): Promise<FileRecord[]>
  getFileUrl(id: ID): Promise<string | null>

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
  'addObject', 'updateObjects', 'removeObjects', 'addConnection', 'updateConnection', 'removeConnections',
  'getJournal', 'listJournal',
  'search',
  'importFiles', 'getFileUrl',
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
