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

/** 'block' = a text block written directly on a whiteboard (hidden from the card library by default). */
export type CardKind = 'card' | 'block'

/** Display style of a text block, stored per placement in the whiteboard object's data (`style`). */
export type TextBlockStyle = 'plain' | 'framed'

export interface Card {
  id: ID
  kind: CardKind
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
  kind: CardKind
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

/** Free-form key/value metadata pair on a whiteboard (e.g. "Autor" -> "Jane"). */
export interface WhiteboardProperty {
  id: ID
  key: string
  value: string
}

export interface Whiteboard {
  id: ID
  name: string
  parentId: ID | null
  /** sidebar folder this whiteboard is filed under, or null for top level */
  folderId: ID | null
  viewport: { x: number; y: number; zoom: number }
  properties: WhiteboardProperty[]
  createdAt: number
  updatedAt: number
}

/** A whiteboard plus lightweight stats for list/tile views (e.g. Home) that shouldn't load the full board. */
export interface WhiteboardSummary extends Whiteboard {
  objectCount: number
}

/** What a Home tile draws for an object (text blocks and frameless ink get their own look). */
export type BoardPreviewKind = 'card' | 'block' | 'section' | 'table' | 'chart' | 'sketch' | 'ink' | 'other'

/** One object in a board preview: geometry + kind, a short label at most — never the content. */
export interface BoardPreviewItem {
  kind: BoardPreviewKind
  x: number
  y: number
  w: number
  h: number
  /** palette colour name (sections, tinted cards) or null */
  color: string | null
  label?: string
  /** text blocks: drawn with a frame */
  framed?: boolean
  /** tables: number of rows (capped) */
  rows?: number
  chartType?: string
  /** frameless ink: simplified polylines in board coordinates */
  strokes?: { color: string; opacity?: number; points: [number, number][] }[]
}

export interface BoardPreview {
  id: ID
  /** union of the items' boxes; null for an empty board */
  bounds: { x: number; y: number; width: number; height: number } | null
  items: BoardPreviewItem[]
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

export type ObjectKind = 'card' | 'section' | 'whiteboard' | 'file' | 'mindmap' | 'mermaid' | 'sketch' | 'chart' | 'link' | 'table'

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
  /** title for 'section', mermaid/mindmap source, … */
  data: Record<string, unknown>
}

/** Line rendering of a connection. */
export type LineStyle = 'solid' | 'dashed'
/** Which ends of a connection carry an arrow head. */
export type ArrowEnds = 'none' | 'end' | 'both'

export interface Connection {
  id: ID
  whiteboardId: ID
  sourceId: ID
  targetId: ID
  label: string
  /** Palette name (see lib/colors) or null for the default edge color. */
  color: string | null
  lineStyle: LineStyle
  arrows: ArrowEnds
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
  /** for card hits: regular card or text block */
  cardKind?: CardKind
}

export interface FileRecord {
  id: ID
  name: string
  mime: string
  path: string
  size: number
  createdAt: number
}

/**
 * One rectangle of a PDF highlight, normalised to the page box (0..1) so it survives
 * zooming, window resizing and re-rendering at a different scale.
 */
export interface HighlightRect {
  x: number
  y: number
  w: number
  h: number
}

/** A colour highlight drawn over the text layer of an imported PDF. */
export interface PdfHighlight {
  id: ID
  fileId: ID
  /** 1-based page number. */
  page: number
  /** Palette key (see renderer `lib/colors.ts`), e.g. 'yellow'. */
  color: string
  /** The selected text, kept so cards and the highlight list work without re-opening the PDF. */
  text: string
  note: string | null
  rects: HighlightRect[]
  createdAt: number
  updatedAt: number
}

export type ObjectPatch = Partial<Pick<WhiteboardObject, 'x' | 'y' | 'width' | 'height' | 'z' | 'color' | 'data'>> & {
  id: ID
}

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskDueFilter = 'overdue' | 'today' | 'week'

export interface Task {
  cardId: ID
  cardTitle: string
  cardIcon: string | null
  cardColor: string | null
  /** stable id on the taskItem node, survives reordering/insertion (unlike `index`) */
  taskId: string
  /** position among taskItems in the card's content, depth-first */
  index: number
  text: string
  /** mirrors the checkbox in the card content; always equal to `status === 'done'` */
  checked: boolean
  status: TaskStatus
  priority: TaskPriority
  assignee: ProfileRef | null
  /** local calendar date, YYYY-MM-DD */
  dueDate: string | null
  createdBy: ProfileRef | null
  /** when the task metadata was first written (null for tasks only ever edited in a card) */
  createdAt: number | null
  updatedAt: number
  commentCount: number
  attachmentCount: number
}

export interface TaskPatch {
  cardId: ID
  taskId: string
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: ID | null
  dueDate?: string | null
  text?: string
}

export type TaskActivityKind = 'created' | 'status' | 'priority' | 'assignee' | 'due' | 'title'

/** A system entry in a task's activity timeline ("ddkbs changed status to Done"). */
export interface TaskActivity {
  id: ID
  cardId: ID
  taskId: string
  actor: ProfileRef | null
  kind: TaskActivityKind
  /** raw values: status/priority keys, profile ids (assignee), YYYY-MM-DD (due), text (title) */
  from: string | null
  to: string | null
  createdAt: number
}

/** A local person using this knowledge base (Vercel-style account row in the sidebar). */
export interface Profile {
  id: ID
  name: string
  email: string | null
  avatarFileId: ID | null
  /** sidera-file:// URL of the avatar image, if any */
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
