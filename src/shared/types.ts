// Domain types shared by main, preload, renderer and the MCP server.

export type ID = string

/** Tiptap / ProseMirror JSON document. */
export interface DocJSON {
  type: string
  attrs?: Record<string, unknown>
  content?: DocJSON[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

export interface Card {
  id: ID
  title: string
  content: DocJSON
  contentText: string
  /** palette colour name (gray, red, …) or null */
  color: string | null
  /** emoji ("🚀") or app icon reference ("icon:Lightbulb"), or null */
  icon: string | null
  createdAt: number
  updatedAt: number
}

export interface CardSummary {
  id: ID
  title: string
  excerpt: string
  color: string | null
  icon: string | null
  updatedAt: number
  tags: Tag[]
  /** property id → value; only filled when listing cards of a tag */
  values?: Record<ID, unknown>
}

export interface Tag {
  id: ID
  name: string
  color: string
}

export type PropertyType = 'select' | 'text' | 'number' | 'date' | 'checkbox'

export interface SelectOption {
  id: string
  name: string
  color: string
}

export interface TagProperty {
  id: ID
  tagId: ID
  name: string
  type: PropertyType
  options: SelectOption[]
  position: number
}

export interface Whiteboard {
  id: ID
  name: string
  parentId: ID | null
  /** sidebar folder this whiteboard is filed under, or null for top level */
  folderId: ID | null
  viewport: { x: number; y: number; zoom: number }
  createdAt: number
  updatedAt: number
}

/** Sidebar folder for organizing whiteboards. Folders can nest inside other folders. */
export interface Folder {
  id: ID
  name: string
  parentId: ID | null
  position: number
  createdAt: number
  updatedAt: number
}

export type ObjectKind = 'card' | 'text' | 'section' | 'whiteboard' | 'file' | 'mindmap' | 'mermaid' | 'sketch' | 'chart' | 'link'

export interface WhiteboardObject {
  id: ID
  whiteboardId: ID
  kind: ObjectKind
  /** card id, child whiteboard id or file id — depending on kind */
  refId: ID | null
  x: number
  y: number
  width: number
  height: number
  z: number
  color: string | null
  /** text for 'text', title for 'section', mermaid/mindmap source, … */
  data: Record<string, unknown>
}

export interface Connection {
  id: ID
  whiteboardId: ID
  sourceId: ID
  targetId: ID
  label: string
  data: Record<string, unknown>
}

export interface WhiteboardDetail {
  whiteboard: Whiteboard
  breadcrumb: Pick<Whiteboard, 'id' | 'name'>[]
  objects: WhiteboardObject[]
  connections: Connection[]
  cards: Record<ID, CardSummary>
  children: Whiteboard[]
}

export interface Backlink {
  cardId: ID
  title: string
}

export interface CardDetail extends Card {
  tags: Tag[]
  backlinks: Backlink[]
  whiteboards: Pick<Whiteboard, 'id' | 'name'>[]
  properties: { property: TagProperty; value: unknown }[]
}

export interface KanbanColumn {
  option: SelectOption | null // null = "No value"
  cards: CardSummary[]
}

export interface KanbanBoard {
  tag: Tag
  property: TagProperty
  columns: KanbanColumn[]
}

export interface SearchHit {
  id: ID
  title: string
  snippet: string
  kind: 'card' | 'whiteboard'
}

export interface JournalDay {
  date: string // YYYY-MM-DD
  card: Card
}

export interface FileRecord {
  id: ID
  name: string
  mime: string
  path: string
  size: number
  createdAt: number
}

export type ObjectPatch = Partial<Pick<WhiteboardObject, 'x' | 'y' | 'width' | 'height' | 'z' | 'color' | 'data'>> & {
  id: ID
}

export interface Task {
  cardId: ID
  cardTitle: string
  isJournal: boolean
  journalDate: string | null
  /** stable id on the taskItem node, survives reordering/insertion (unlike `index`) */
  taskId: string
  /** position among taskItems in the card's content, depth-first */
  index: number
  text: string
  checked: boolean
  updatedAt: number
  commentCount: number
}

/** A local person using this knowledge base (Vercel-style account row in the sidebar). */
export interface Profile {
  id: ID
  name: string
  email: string | null
  avatarFileId: ID | null
  /** canvascl-file:// URL of the avatar image, if any */
  avatarUrl: string | null
  /** TAG_COLORS key used as the initials background */
  color: string
  createdAt: number
  updatedAt: number
}

export type ProfileRef = Pick<Profile, 'id' | 'name' | 'color' | 'avatarUrl'>

export interface TaskComment {
  id: ID
  cardId: ID
  taskId: string
  body: string
  /** the profile that wrote the comment (null for deleted profiles) */
  author: ProfileRef | null
  createdAt: number
  updatedAt: number
  files: FileRecord[]
}

/** og:* / meta data fetched for a `link` whiteboard object. */
export interface LinkPreviewData {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
  favicon?: string
  fetchedAt: number
  /** original remote URLs (the displayed image/favicon are cached locally) */
  remoteImage?: string
  remoteFavicon?: string
}
