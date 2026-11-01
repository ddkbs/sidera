import type { ApiMethod } from '@shared/api'
import type { ObjectKind, ObjectPatch, SearchHit, Whiteboard, WhiteboardObject } from '@shared/types'
import { FILE_PROTOCOL, LEGACY_FILE_PROTOCOL } from '@shared/fileProtocol'
import { validateUpload } from '@shared/sync/protocol'
import type { Services } from '../services'

/**
 * What a paired iPad may do: a strict whitelist of CanvasApi methods. The device sees the list of whiteboards (names
 * and previews, `authorizeWorkspace`) and opens one; every other call is scoped to that ONE open whiteboard
 * (`BoardScope`). Reads return only the board, the cards placed on it and the files it references; writes may only
 * touch objects / connections of that board and cards placed on it (or created by this device for it). Anything
 * else — the card library, search, settings, native dialogs, file paths — is refused. Pure logic over `Services`, so
 * it is unit-tested against a real in-memory database.
 */

export class PolicyError extends Error {}

const deny = (why = 'Not available on iPad'): never => {
  throw new PolicyError(why)
}

const OBJECT_KINDS: ObjectKind[] = ['card', 'section', 'whiteboard', 'file', 'mindmap', 'mermaid', 'sketch', 'chart', 'link', 'table', 'stock']
const MAX_IDS = 5000

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64
const id = (v: unknown): string => (isId(v) ? v : deny('Invalid id'))
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : deny('Invalid input'))
const ids = (v: unknown): string[] => (Array.isArray(v) && v.length <= MAX_IDS ? v.map(id) : deny('Invalid ids'))
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e7 ? v : deny('Invalid number'))
const optNum = (v: unknown): number | undefined => (v === undefined ? undefined : num(v))
const optStr = (v: unknown, max = 200): string | undefined => (v === undefined ? undefined : typeof v === 'string' && v.length <= max ? v : deny('Invalid text'))
const color = (v: unknown): string | null | undefined => (v === undefined || v === null ? v : optStr(v, 32))
const data = (v: unknown): Record<string, unknown> | undefined => (v === undefined ? undefined : obj(v))

const FILE_REF = new RegExp(`(?:${FILE_PROTOCOL}|${LEGACY_FILE_PROTOCOL})://files/([A-Za-z0-9_%.-]{1,200})`, 'g')

/** File ids referenced as sidera-file URLs anywhere inside a JSON value (card content, object data). */
export function referencedFileIds(value: unknown, into = new Set<string>()): Set<string> {
  const json = typeof value === 'string' ? value : JSON.stringify(value ?? null)
  for (const m of json.matchAll(FILE_REF)) {
    try {
      into.add(decodeURIComponent(m[1]))
    } catch {
      /* malformed escape: ignore */
    }
  }
  return into
}

type Decision = { args: unknown[]; post?: (data: unknown) => unknown } | { result: unknown }

/** Whiteboard fields the board list on the iPad needs (no properties: they may hold library data). */
const listed = (w: Whiteboard & { objectCount?: number }) => ({
  id: w.id,
  name: w.name,
  parentId: w.parentId,
  folderId: w.folderId,
  viewport: w.viewport,
  properties: [],
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
  ...(w.objectCount !== undefined ? { objectCount: w.objectCount } : {})
})

/** Calls allowed before / besides opening a whiteboard: the board list and its previews. null = not one of them. */
export function authorizeWorkspace(method: ApiMethod, args: unknown[]): Decision | null {
  switch (method) {
    case 'listWhiteboards':
    case 'listWhiteboardsWithStats':
      return { args: [], post: (list) => (list as Whiteboard[]).map(listed) }
    case 'getBoardPreviews':
      return { args: [ids(args[0])] }
    default:
      return null
  }
}

interface Snapshot {
  objects: Map<string, WhiteboardObject>
  connections: Set<string>
  cards: Set<string>
  children: Set<string>
  /** null until a file check needs it (scanning card contents is the expensive part) */
  files: Set<string> | null
}

export class BoardScope {
  /** cards / files this device created or that were on the board while shared: still allowed after removal (undo) */
  private knownCards = new Set<string>()
  private knownFiles = new Set<string>()
  private snap: Snapshot | null = null

  constructor(
    private services: Services,
    readonly boardId: string
  ) {}

  /** Call on every data change: the next check re-reads the board. */
  invalidate(): void {
    this.snap = null
  }

  private snapshot(): Snapshot {
    if (this.snap) return this.snap
    const d = this.services.getWhiteboard(this.boardId)
    if (!d) deny('Whiteboard not found')
    const objects = new Map(d!.objects.map((o) => [o.id, o]))
    const cards = new Set(d!.objects.filter((o) => o.kind === 'card' && o.refId).map((o) => o.refId!))
    for (const c of cards) this.knownCards.add(c)
    this.snap = { objects, connections: new Set(d!.connections.map((c) => c.id)), cards, children: new Set(d!.children.map((c) => c.id)), files: null }
    return this.snap
  }

  private files(): Set<string> {
    const s = this.snapshot()
    if (s.files) return s.files
    const files = new Set<string>()
    for (const o of s.objects.values()) {
      if (o.kind === 'file' && o.refId) files.add(o.refId)
      referencedFileIds(o.data, files)
    }
    for (const c of s.cards) referencedFileIds(this.services.getCard(c)?.content, files)
    for (const f of files) this.knownFiles.add(f)
    s.files = files
    return files
  }

  onBoard(objectId: string): boolean {
    return this.snapshot().objects.has(objectId)
  }

  cardAllowed(cardId: string): boolean {
    return this.snapshot().cards.has(cardId) || this.knownCards.has(cardId)
  }

  fileAllowed(fileId: string): boolean {
    return this.knownFiles.has(fileId) || this.files().has(fileId)
  }

  private requireObjects(list: string[]): void {
    for (const o of list) if (!this.onBoard(o)) deny('Object is not on the shared whiteboard')
  }

  private requireCard(cardId: unknown): string {
    const c = id(cardId)
    if (!this.cardAllowed(c)) deny('Card is not on the shared whiteboard')
    return c
  }

  private requireBoard(whiteboardId: unknown): void {
    if (whiteboardId !== this.boardId) deny('Only the shared whiteboard is available')
  }

  private refFor(kind: ObjectKind, refId: unknown): string | null {
    if (refId === undefined || refId === null) return kind === 'card' || kind === 'file' || kind === 'whiteboard' ? deny('Missing reference') : null
    const r = id(refId)
    if (kind === 'card') return this.requireCard(r)
    if (kind === 'file') return this.fileAllowed(r) ? r : deny('File is not on the shared whiteboard')
    if (kind === 'whiteboard') return this.snapshot().children.has(r) ? r : deny('Nested whiteboards cannot be added from the iPad')
    return deny('Unexpected reference')
  }

  private patch(p: unknown): ObjectPatch {
    const o = obj(p)
    const out: ObjectPatch = { id: id(o.id) }
    if (o.x !== undefined) out.x = num(o.x)
    if (o.y !== undefined) out.y = num(o.y)
    if (o.width !== undefined) out.width = num(o.width)
    if (o.height !== undefined) out.height = num(o.height)
    if (o.z !== undefined) out.z = num(o.z)
    if (o.color !== undefined) out.color = color(o.color) ?? null
    if (o.data !== undefined) out.data = data(o.data)
    return out
  }

  /**
   * Checks one call and returns the (cleaned) arguments to run it with, or a ready result for calls answered without
   * touching the services (`result`). Throws PolicyError when the call is not allowed.
   */
  authorize(method: ApiMethod, args: unknown[]): Decision {
    const a0 = args[0]
    switch (method) {
      // ── reads ──
      case 'getWhiteboard':
        this.requireBoard(a0)
        return { args: [this.boardId] }
      case 'getCard':
        return { args: [this.requireCard(a0)] }
      case 'getFileUrl':
      case 'listHighlights': {
        const f = id(a0)
        if (!this.fileAllowed(f)) deny('File is not on the shared whiteboard')
        return { args: [f] }
      }
      case 'search': {
        // card mentions in the editor: only cards placed on the shared board are found
        const q = optStr(a0, 200) ?? ''
        const limit = Math.min(50, Math.max(1, Math.floor(optNum(args[1]) ?? 20)))
        return {
          args: [q, 500, { kind: 'all' }],
          post: (hits) => (hits as SearchHit[]).filter((h) => h.kind === 'card' && this.snapshot().cards.has(h.id)).slice(0, limit)
        }
      }
      case 'listTags':
      case 'listProfiles':
        // library-wide metadata stays on the Mac
        return { args: [], post: () => [] }
      case 'getActiveProfile':
        return { args: [] }

      // ── board objects ──
      case 'addObject': {
        const o = obj(a0)
        this.requireBoard(o.whiteboardId)
        const kind = OBJECT_KINDS.includes(o.kind as ObjectKind) ? (o.kind as ObjectKind) : deny('Invalid kind')
        return {
          args: [
            {
              whiteboardId: this.boardId,
              kind,
              refId: this.refFor(kind, o.refId),
              x: num(o.x),
              y: num(o.y),
              width: optNum(o.width),
              height: optNum(o.height),
              color: color(o.color),
              data: data(o.data)
            }
          ]
        }
      }
      case 'updateObjects': {
        if (!Array.isArray(a0) || a0.length > MAX_IDS) deny('Invalid patches')
        const patches = (a0 as unknown[]).map((p) => this.patch(p))
        this.requireObjects(patches.map((p) => p.id))
        return { args: [patches] }
      }
      case 'removeObjects': {
        const list = ids(a0)
        this.requireObjects(list)
        return { args: [list] }
      }
      case 'restoreObjects': {
        if (!Array.isArray(a0) || !Array.isArray(args[1]) || a0.length > MAX_IDS || args[1].length > MAX_IDS) deny('Invalid input')
        const objects = (a0 as unknown[]).map((raw) => {
          const o = obj(raw)
          this.requireBoard(o.whiteboardId)
          const oid = id(o.id)
          const existing = this.services.getObject(oid)
          if (existing && existing.whiteboardId !== this.boardId) deny('Object belongs to another whiteboard')
          const kind = OBJECT_KINDS.includes(o.kind as ObjectKind) ? (o.kind as ObjectKind) : deny('Invalid kind')
          return {
            id: oid,
            whiteboardId: this.boardId,
            kind,
            refId: this.refFor(kind, o.refId),
            x: num(o.x),
            y: num(o.y),
            width: num(o.width),
            height: num(o.height),
            z: num(o.z),
            color: color(o.color) ?? null,
            data: data(o.data) ?? {}
          } satisfies WhiteboardObject
        })
        const restored = new Set(objects.map((o) => o.id))
        const conns = (args[1] as unknown[]).map((raw) => {
          const c = obj(raw)
          this.requireBoard(c.whiteboardId)
          const [s, t] = [id(c.sourceId), id(c.targetId)]
          for (const end of [s, t]) if (!restored.has(end) && !this.onBoard(end)) deny('Connection end is not on the shared whiteboard')
          return {
            id: id(c.id),
            whiteboardId: this.boardId,
            sourceId: s,
            targetId: t,
            label: optStr(c.label, 500) ?? '',
            color: color(c.color) ?? null,
            lineStyle: c.lineStyle === 'dashed' ? ('dashed' as const) : ('solid' as const),
            arrows: c.arrows === 'none' || c.arrows === 'both' ? c.arrows : ('end' as const),
            data: data(c.data) ?? {}
          }
        })
        return { args: [objects, conns] }
      }
      case 'chartFromTable': {
        const o = obj(a0)
        const t = id(o.tableId)
        this.requireObjects([t])
        return { args: [{ tableId: t, chartType: optStr(o.chartType, 32) }] }
      }

      // ── connections ──
      case 'addConnection': {
        const o = obj(a0)
        this.requireBoard(o.whiteboardId)
        const [s, t] = [id(o.sourceId), id(o.targetId)]
        this.requireObjects([s, t])
        return { args: [{ whiteboardId: this.boardId, sourceId: s, targetId: t, label: optStr(o.label, 500) }] }
      }
      case 'updateConnection': {
        const o = obj(a0)
        const c = id(o.id)
        if (!this.snapshot().connections.has(c)) deny('Connection is not on the shared whiteboard')
        return {
          args: [
            {
              id: c,
              label: optStr(o.label, 500),
              color: color(o.color),
              lineStyle: o.lineStyle === undefined ? undefined : o.lineStyle === 'dashed' ? 'dashed' : 'solid',
              arrows: o.arrows === undefined ? undefined : o.arrows === 'none' || o.arrows === 'both' ? o.arrows : 'end',
              data: data(o.data)
            }
          ]
        }
      }
      case 'removeConnections': {
        const list = ids(a0)
        for (const c of list) if (!this.snapshot().connections.has(c)) deny('Connection is not on the shared whiteboard')
        return { args: [list] }
      }

      // ── the board itself ──
      case 'updateWhiteboard': {
        const o = obj(a0)
        this.requireBoard(o.id)
        const name = optStr(o.name, 200)
        // the iPad never moves the Mac's saved viewport: a viewport-only update is answered without writing
        if (name === undefined) return { result: this.services.getWhiteboard(this.boardId)!.whiteboard }
        return { args: [{ id: this.boardId, name }] }
      }

      // ── cards on the board ──
      case 'createCard': {
        const o = obj(a0)
        if (o.kind !== undefined && o.kind !== 'card' && o.kind !== 'block') deny('Invalid kind')
        // no tags: tagging reaches into the library
        return { args: [{ title: optStr(o.title, 500), content: data(o.content), markdown: optStr(o.markdown, 200_000), kind: o.kind }] }
      }
      case 'addTextBlock': {
        const o = obj(a0)
        this.requireBoard(o.whiteboardId)
        return {
          args: [
            {
              whiteboardId: this.boardId,
              x: num(o.x),
              y: num(o.y),
              width: optNum(o.width),
              content: data(o.content),
              markdown: optStr(o.markdown, 200_000),
              style: o.style === 'framed' ? 'framed' : o.style === undefined ? undefined : 'plain'
            }
          ]
        }
      }
      case 'updateCard': {
        const o = obj(a0)
        return {
          args: [
            {
              id: this.requireCard(o.id),
              title: optStr(o.title, 500),
              content: data(o.content),
              color: color(o.color),
              icon: o.icon === undefined || o.icon === null ? o.icon : optStr(o.icon, 64),
              kind: o.kind === undefined ? undefined : o.kind === 'card' || o.kind === 'block' ? o.kind : deny('Invalid kind')
            }
          ]
        }
      }
      case 'deleteCard':
      case 'restoreCard':
        return { args: [this.requireCard(a0)] }
      case 'setTaskChecked':
        return { args: [this.requireCard(a0), num(args[1]), args[2] === true] }
      case 'updateTask': {
        const o = obj(a0)
        const patch: Record<string, unknown> = { cardId: this.requireCard(o.cardId), taskId: optStr(o.taskId, 64) ?? deny('Invalid task') }
        for (const k of ['status', 'priority', 'assigneeId', 'dueDate', 'text'] as const) if (o[k] !== undefined) patch[k] = o[k] === null ? null : optStr(o[k], 10_000)
        return { args: [patch] }
      }

      // ── files & links ──
      case 'importFileData':
        return { args: [validateUpload(a0)] }
      case 'fetchLinkPreview': {
        const url = optStr(a0, 2048)
        if (!url || !/^https?:\/\//i.test(url)) deny('Invalid URL')
        return { args: [url] }
      }
      case 'clipUrl': {
        const o = obj(a0)
        const url = optStr(o.url, 2048)
        if (!url || !/^https?:\/\//i.test(url)) deny('Invalid URL')
        return { args: [{ url }] }
      }
      default:
        // everything else: other boards, the library, search, tags/properties, tasks lists, folders, profiles edits,
        // native file dialogs / paths (importFiles!), opening files, markdown export, MCP info …
        return deny()
    }
  }

  /** Learns ids a successful call made reachable (new cards / files of this device). */
  learn(method: ApiMethod, result: unknown): void {
    const r = result as Record<string, unknown> | null
    if (!r || typeof r !== 'object') return
    if ((method === 'createCard' || method === 'clipUrl') && isId(r.id)) this.knownCards.add(r.id)
    if (method === 'addTextBlock' && isId((r.card as { id?: unknown })?.id)) this.knownCards.add((r.card as { id: string }).id)
    if (method === 'importFileData' && isId(r.id)) this.knownFiles.add(r.id)
    if (method === 'fetchLinkPreview') referencedFileIds([r.image, r.favicon], this.knownFiles)
    this.invalidate()
  }
}
