import type { AiProviderId } from './ai'
import type { AppSettings, SettingsPatch } from './settings'
import type {
  ArrowEnds,
  Card,
  CardDetail,
  CardSummary,
  Connection,
  LineStyle,
  DocJSON,
  FileRecord,
  Folder,
  HighlightRect,
  ID,
  KanbanBoard,
  LinkPreviewData,
  ObjectKind,
  ObjectPatch,
  PdfHighlight,
  PropertyType,
  SearchHit,
  SelectOption,
  Tag,
  TagProperty,
  Task,
  TaskActivity,
  TaskComment,
  TaskDueFilter,
  TaskPatch,
  TaskPriority,
  TaskStatus,
  Profile,
  Whiteboard,
  WhiteboardDetail,
  WhiteboardObject,
  WhiteboardProperty
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
  restoreCard(id: ID): Promise<void>
  /** Find-or-create the "Inbox" card used as the default target for tasks added without a card. */
  getInboxCard(): Promise<Card>

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
  createWhiteboard(input: { name: string; parentId?: ID | null; folderId?: ID | null }): Promise<Whiteboard>
  updateWhiteboard(input: { id: ID; name?: string; viewport?: Whiteboard['viewport'] }): Promise<Whiteboard>
  updateWhiteboardProperties(whiteboardId: ID, properties: WhiteboardProperty[]): Promise<Whiteboard>
  deleteWhiteboard(id: ID): Promise<void>
  restoreWhiteboard(id: ID): Promise<void>
  moveWhiteboardToFolder(whiteboardId: ID, folderId: ID | null): Promise<void>
  /** Copies a whiteboard's name, objects and connections (not nested child whiteboards) into a new board next to it. */
  duplicateWhiteboard(id: ID): Promise<Whiteboard>

  // folders
  listFolders(): Promise<Folder[]>
  createFolder(input: { name: string; parentId?: ID | null }): Promise<Folder>
  renameFolder(id: ID, name: string): Promise<Folder>
  deleteFolder(id: ID): Promise<void>
  moveFolder(id: ID, parentId: ID | null): Promise<void>
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
  updateConnection(input: {
    id: ID
    label?: string
    color?: string | null
    lineStyle?: LineStyle
    arrows?: ArrowEnds
    data?: Record<string, unknown>
  }): Promise<void>
  removeConnections(ids: ID[]): Promise<void>
  organizeBoard(input: {
    whiteboardId: ID
    groups: { title: string; color?: string; objectIds: ID[] }[]
    removeExistingSections?: boolean
  }): Promise<{ sections: { id: ID; title: string; objectCount: number }[]; unsorted: number }>

  // tasks
  /**
   * `status`: 'open' (not done) / 'done' / 'all', or an exact TaskStatus. `assigneeId` null = unassigned.
   * `due` compares against the local date. `today` (YYYY-MM-DD) overrides "now" for tests.
   */
  listTasks(opts?: {
    status?: 'open' | 'all' | TaskStatus
    assigneeId?: ID | null
    priority?: TaskPriority
    due?: TaskDueFilter
    today?: string
  }): Promise<Task[]>
  setTaskChecked(cardId: ID, index: number, checked: boolean): Promise<void>
  /** Add a to-do to a card, or to the "Inbox" card (created on first use) when no card is given. */
  addTask(input: { text: string; cardId?: ID; status?: TaskStatus; priority?: TaskPriority; assigneeId?: ID | null; dueDate?: string | null }): Promise<Task>
  /** Change task properties; status 'done' ⇔ checkbox in the card content. Logs activity for each change. */
  updateTask(input: TaskPatch): Promise<Task>
  listTaskActivity(cardId: ID, taskId: string): Promise<TaskActivity[]>

  // task comments
  listTaskComments(cardId: ID, taskId: string): Promise<TaskComment[]>
  addTaskComment(input: { cardId: ID; taskId: string; body: string; fileIds?: ID[] }): Promise<TaskComment>
  updateTaskComment(input: { id: ID; body: string }): Promise<TaskComment>
  deleteTaskComment(id: ID): Promise<void>

  // profiles
  listProfiles(): Promise<Profile[]>
  createProfile(input: { name: string; email?: string | null; color?: string; avatarFileId?: ID | null }): Promise<Profile>
  /** avatarFileId must reference an imported image file (null removes the avatar). */
  updateProfile(input: { id: ID; name?: string; email?: string | null; color?: string; avatarFileId?: ID | null }): Promise<Profile>
  /** Refuses to delete the last or the active profile. */
  deleteProfile(id: ID): Promise<void>
  getActiveProfile(): Promise<Profile>
  setActiveProfile(id: ID): Promise<Profile>

  // search
  search(query: string, limit?: number): Promise<SearchHit[]>

  // files
  importFiles(paths?: string[]): Promise<FileRecord[]>
  /** Write raw bytes (e.g. a pasted clipboard image) into the files dir and register them. 25 MB limit. */
  importFileData(input: { name: string; mime: string; dataBase64: string }): Promise<FileRecord>
  getFileUrl(id: ID): Promise<string | null>
  /** Open an imported file (looked up by id, never an arbitrary path) with the default macOS app. */
  openFile(id: ID): Promise<void>

  // pdf highlights (per imported file, ordered by page then position on the page)
  listHighlights(fileId: ID): Promise<PdfHighlight[]>
  createHighlight(input: {
    fileId: ID
    page: number
    text: string
    rects: HighlightRect[]
    color?: string
    note?: string | null
  }): Promise<PdfHighlight>
  updateHighlight(input: { id: ID; color?: string; note?: string | null }): Promise<PdfHighlight>
  deleteHighlight(id: ID): Promise<void>

  // web links
  fetchLinkPreview(url: string): Promise<LinkPreviewData>
  clipUrl(input: { url: string; tagIds?: ID[] }): Promise<Card>

  // markdown export / import (opens native folder / file pickers)
  exportMarkdown(): Promise<{ count: number; dir: string } | null>
  importMarkdown(): Promise<{ count: number }>

  // meta
  getMcpInfo(): Promise<{ running: boolean; url: string | null; stdioCommand: string }>
}

export type ApiMethod = keyof CanvasApi

export const API_METHODS: ApiMethod[] = [
  'listCards', 'getCard', 'createCard', 'updateCard', 'deleteCard', 'restoreCard', 'getInboxCard',
  'listTags', 'createTag', 'updateTag', 'deleteTag', 'setCardTags',
  'listProperties', 'createProperty', 'updateProperty', 'setPropertyValue',
  'getKanban', 'moveKanbanItem',
  'listWhiteboards', 'getWhiteboard', 'createWhiteboard', 'updateWhiteboard', 'updateWhiteboardProperties', 'deleteWhiteboard', 'restoreWhiteboard', 'moveWhiteboardToFolder', 'duplicateWhiteboard',
  'listFolders', 'createFolder', 'renameFolder', 'deleteFolder', 'moveFolder',
  'addObject', 'updateObjects', 'removeObjects', 'restoreObjects', 'addConnection', 'updateConnection', 'removeConnections', 'organizeBoard',
  'listTasks', 'setTaskChecked', 'addTask', 'updateTask', 'listTaskActivity',
  'listTaskComments', 'addTaskComment', 'updateTaskComment', 'deleteTaskComment',
  'listProfiles', 'createProfile', 'updateProfile', 'deleteProfile', 'getActiveProfile', 'setActiveProfile',
  'search',
  'importFiles', 'importFileData', 'getFileUrl', 'openFile',
  'listHighlights', 'createHighlight', 'updateHighlight', 'deleteHighlight',
  'fetchLinkPreview', 'clipUrl',
  'exportMarkdown', 'importMarkdown',
  'getMcpInfo'
]

/** Event pushed from main to renderer whenever data changed outside the renderer (e.g. via MCP). */
export const DB_CHANGED = 'db:changed'
export type DbChangeScope = 'cards' | 'tags' | 'whiteboards' | 'profiles' | 'files' | 'all'

/** Event pushed to the renderer for every MCP tool call. */
export const MCP_ACTIVITY = 'mcp:activity'
export interface McpActivity {
  tool: string
  args: string
  at: number
}

/** Event pushed to the renderer whenever the main window enters/leaves native macOS fullscreen. */
export const FULLSCREEN_CHANGED = 'app:fullscreen-changed'

/** A choice offered to the user by the `ask_user_questions` chat-local tool. */
export interface AskUserOption {
  label: string
  description?: string
}

/** One clarifying question the assistant wants answered before it continues. */
export interface AskUserQuestion {
  id: string
  question: string
  type: 'single' | 'multi' | 'text'
  /** Present (non-empty) for 'single'/'multi'; absent for 'text'. */
  options?: AskUserOption[]
}

/** The user's response to one question: selected option label(s), or free text for 'text'. */
export interface AskUserAnswer {
  id: string
  values: string[]
}

/** Streaming events from the in-app chat agent. */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string }
  /** The model called `ask_user_questions`. The renderer shows the Questionnaire and the loop pauses until
   *  `ChatBridge.answerQuestions`/`skipQuestions` resolves this `requestId`. */
  | { type: 'ask'; requestId: string; questions: AskUserQuestion[] }
  /** A native web search started (no query yet), got its query, or failed. */
  | { type: 'search'; query?: string; error?: string }
  /** Web sources cited in the current assistant message (renderer merges/dedupes by URL). */
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'error'; message: string }
  | { type: 'done' }

export interface ChatSource {
  url: string
  title?: string
  citedText?: string
}

export const CHAT_EVENT = 'chat:event'

/** Per-provider connection status ("Connected" / "Add key" in Settings). */
export interface ProviderStatus {
  provider: AiProviderId
  hasKey: boolean
}

/** Chat bridge (separate from CanvasApi because it streams). */
export interface ChatBridge {
  send(text: string): Promise<void>
  stop(): Promise<void>
  reset(): Promise<void>
  /** Whether the currently active provider (AppSettings.ai.provider) has a usable key. */
  hasKey(): Promise<boolean>
  /** Set/clear the key for the currently active provider. */
  setKey(key: string | null): Promise<void>
  /** Connection status for every provider. */
  getProviderStatus(): Promise<ProviderStatus[]>
  /** Set/clear the key for a specific provider. */
  setProviderKey(provider: AiProviderId, key: string | null): Promise<void>
  /** Fetch the live model list for a provider ("Load models"). baseUrl override for ollama/custom. */
  listModels(provider: AiProviderId, baseUrl?: string): Promise<string[]>
  /** Resolve a pending `ask` event with the user's answers. */
  answerQuestions(requestId: string, answers: AskUserAnswer[]): Promise<void>
  /** Resolve a pending `ask` event as skipped — the model is told to proceed with its best judgement. */
  skipQuestions(requestId: string): Promise<void>
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
  /** Whether the main window is currently in native macOS fullscreen. */
  isFullScreen(): Promise<boolean>
}
