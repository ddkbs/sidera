/**
 * Sidera Draw — the iPad companion page. Served by the Mac over the LAN (plain HTTP), bundled into one
 * self-contained HTML file by scripts/build-companion.mjs. Everything sent to the Mac is end-to-end encrypted
 * with the key from the URL fragment (see src/shared/drawProtocol.ts).
 */
import { APP_NAME } from '../shared/brand'
import {
  base64Bytes,
  DRAW_HEARTBEAT_MS,
  DRAW_LIMITS,
  fromB64u,
  open,
  seal,
  type DrawImage,
  type DrawImageMime,
  type DrawStroke,
  type DrawSubmission,
  type Message
} from '../shared/drawProtocol'
import { average, contains, corners, darkInk, fitSize, hitsStroke, isRoughlyStraight, pressureFactor, resizeFromCorner, type Pt, type Rect } from './geometry'
import { encodeImage, imageFromBase64, imageStore } from './images'

// ─── elements ───────────────────────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T
const stage = $('stage')
const base = $<HTMLCanvasElement>('base')
const live = $<HTMLCanvasElement>('live')
const baseCtx = base.getContext('2d')!
const liveCtx = live.getContext('2d')!
const sendBtn = $<HTMLButtonElement>('send')
const statusBtn = $<HTMLButtonElement>('status')

// ─── palette ────────────────────────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'pen' | 'highlighter' | 'eraser'
const COLORS: Record<'pen' | 'highlighter', { name: string; hex: string }[]> = {
  pen: [
    { name: 'Ink', hex: '#1e1e1e' },
    { name: 'Blue', hex: '#1971c2' },
    { name: 'Red', hex: '#e03131' },
    { name: 'Green', hex: '#2f9e44' },
    { name: 'Orange', hex: '#f08c00' },
    { name: 'Violet', hex: '#6741d9' }
  ],
  highlighter: [
    { name: 'Yellow', hex: '#fab005' },
    { name: 'Green', hex: '#40c057' },
    { name: 'Blue', hex: '#4dabf7' },
    { name: 'Pink', hex: '#f06595' },
    { name: 'Orange', hex: '#fd7e14' },
    { name: 'Violet', hex: '#9775fa' }
  ]
}
const WIDTHS: Record<'pen' | 'highlighter', number[]> = { pen: [2, 4, 8], highlighter: [14, 22, 34] }
const HIGHLIGHTER_OPACITY = 0.35
const ERASER_RADIUS = 12
const HOLD_MS = 500
const HOLD_SLOP = 4
const PALM_SIZE = 44
/** grab radius of an image's corner handle (screen px; generous for fingers) */
const HANDLE_HIT = 24
const HANDLE_R = 7

type FingerMode = 'auto' | 'on' | 'off'

const ui = {
  tool: 'pen' as Tool,
  color: { pen: COLORS.pen[0].hex, highlighter: COLORS.highlighter[0].hex },
  width: { pen: 1, highlighter: 1 },
  finger: 'auto' as FingerMode
}

// ─── session & persistence ──────────────────────────────────────────────────────────────────────────

const sessionId = location.pathname.split('/')[2] ?? ''
const STORE_KEY = `sidera-draw:v1:${sessionId}`

/** An inserted photo. Its pixels live in `pixels` (and IndexedDB), so undo snapshots and sessionStorage stay small. */
interface ImageItem {
  kind: 'image'
  id: string
  mime: DrawImageMime
  x: number
  y: number
  width: number
  height: number
}
/** The drawing, bottom to top: strokes drawn after an image appear above it. */
type Item = DrawStroke | ImageItem
const isImage = (it: Item): it is ImageItem => (it as ImageItem).kind === 'image'
const isStroke = (it: Item): it is DrawStroke => !isImage(it)

interface Saved {
  k: string
  t?: string
  s?: number
  r?: number
  /** before images existed */
  strokes?: DrawStroke[]
  items?: Item[]
  sent?: boolean
}

const load = (): Saved | null => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null') as Saved | null
  } catch {
    return null
  }
}
const saved = load()

// The key only ever lives in the fragment; move it to this tab's sessionStorage and strip it from the address bar.
const fragment = location.hash.slice(1)
const keyB64 = /^[A-Za-z0-9_-]{43}$/.test(fragment) ? fragment : saved?.k
if (location.hash) history.replaceState(null, '', location.pathname)
let key: Uint8Array | null = null
try {
  key = keyB64 ? fromB64u(keyB64) : null
  if (key?.length !== 32) key = null
} catch {
  key = null
}

let token = saved?.k === keyB64 ? saved?.t : undefined
let seq = Math.max(saved?.s ?? 0, Date.now())
let lastS2c = saved?.r ?? 0
let items: Item[] = saved?.k === keyB64 ? (saved?.items ?? saved?.strokes ?? []) : []
let sent = saved?.sent === true

/** image id → encoded bytes (what gets sent) + something drawable; kept while any undo snapshot may refer to it */
const pixels = new Map<string, { mime: DrawImageMime; data: string; source: CanvasImageSource | null }>()

let saveTimer = 0
let storageWarned = false
function persist(now = false): void {
  const write = (): void => {
    saveTimer = 0
    if (!keyB64) return
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ k: keyB64, t: token, s: seq, r: lastS2c, items, sent } satisfies Saved))
    } catch {
      // storage full: the drawing still exists in memory
      warnStorage()
    }
  }
  clearTimeout(saveTimer)
  if (now) write()
  else saveTimer = window.setTimeout(write, 300)
}

function warnStorage(): void {
  if (storageWarned) return
  storageWarned = true
  toast('This iPad couldn’t save a backup of the drawing — it’s kept while this tab stays open.')
}

// ─── transport ──────────────────────────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

const API = `${location.pathname}/api`

async function call(msg: Record<string, unknown> & { type: string }, timeoutMs = 15_000): Promise<Message> {
  if (!key) throw new Error('no key')
  const n = ++seq
  persist(true)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(seal(key, sessionId, 'c2s', { ...msg, ...(token ? { token } : {}), seq: n })),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl.signal
    })
    if (!res.ok) throw new HttpError(res.status)
    const reply = open(key, sessionId, 's2c', await res.json())
    if (reply.seq <= lastS2c || reply.re !== n) throw new Error('unexpected reply')
    lastS2c = reply.seq
    persist()
    return reply
  } finally {
    clearTimeout(timer)
  }
}

type Conn = 'connecting' | 'connected' | 'offline' | 'closed' | 'taken' | 'sent' | 'nokey'
let conn: Conn = 'connecting'
let host = ''
let failures = 0
let heartbeat = 0
let firstFailureAt = 0

function setConn(next: Conn): void {
  conn = next
  const text: Record<Conn, string> = {
    connecting: 'Connecting…',
    connected: host ? `Connected to ${host}` : 'Connected',
    offline: 'Reconnecting…',
    closed: 'Session closed',
    taken: 'Session in use',
    sent: 'Sent',
    nokey: 'Not connected'
  }
  statusBtn.dataset.state = next === 'connected' || next === 'sent' ? 'connected' : next === 'connecting' || next === 'offline' ? next : 'error'
  $('status-text').textContent = text[next]
  $('session-title').textContent = text[next]
  updateButtons()
}

async function hello(): Promise<void> {
  try {
    const r = await call({ type: 'hello' })
    if (r.type === 'ok' && typeof r.token === 'string') {
      token = r.token
      host = typeof r.host === 'string' ? r.host.slice(0, 60) : ''
      failures = 0
      persist(true)
      setConn('connected')
      startHeartbeat()
    } else if (r.error === 'already-paired') {
      setConn('taken')
      showOverlay('lock', 'Already open on another device', `This drawing session is connected to a different device. Create a new code in ${APP_NAME} to draw here.`)
    } else throw new Error(String(r.error))
  } catch (e) {
    onNetworkError(e)
    if (conn !== 'closed') window.setTimeout(() => conn !== 'connected' && conn !== 'closed' && void hello(), 3000)
  }
}

function startHeartbeat(): void {
  clearInterval(heartbeat)
  heartbeat = window.setInterval(() => void ping(), DRAW_HEARTBEAT_MS)
}

async function ping(): Promise<void> {
  if (conn === 'closed' || conn === 'sent' || conn === 'taken') return clearInterval(heartbeat)
  try {
    const r = await call({ type: 'ping' }, 8000)
    if (r.type !== 'ok') throw new Error(String(r.error))
    failures = 0
    firstFailureAt = 0
    if (conn !== 'connected') setConn('connected')
  } catch (e) {
    onNetworkError(e)
  }
}

/** The Mac closes the port when the session ends, so a dead session looks like a network error: give up after ~60 s. */
function onNetworkError(e: unknown): void {
  failures++
  if (!firstFailureAt) firstFailureAt = Date.now()
  const gone = (e instanceof HttpError && e.status === 404) || Date.now() - firstFailureAt > 60_000
  if (gone) {
    clearInterval(heartbeat)
    setConn('closed')
    showOverlay('info', 'Session closed', `This drawing session has ended. To send a drawing, choose “Draw on iPad” in ${APP_NAME} again and scan the new code.`)
  } else if (conn === 'connected' && failures >= 2) setConn('offline')
}

/** The wire payload: strokes in order, images with the number of strokes stacked below them. */
function submission(): DrawSubmission | null {
  const strokes: DrawStroke[] = []
  const images: DrawImage[] = []
  for (const it of items) {
    if (isStroke(it)) {
      strokes.push(it)
      continue
    }
    const px = pixels.get(it.id)
    if (!px) return null
    images.push({ id: it.id, mime: px.mime, data: px.data, x: round(it.x), y: round(it.y), width: round(it.width), height: round(it.height), strokesBelow: strokes.length })
  }
  return { width: Math.round(stage.clientWidth), height: Math.round(stage.clientHeight), strokes, images }
}

let sending = false
/** the Mac answered but refused the drawing (e.g. validation) */
class Refused extends Error {}

async function send(): Promise<void> {
  if (!items.length || conn !== 'connected' || sending) return
  const drawing = submission()
  if (!drawing) return toast('Images are still loading — try again in a moment.')
  sending = true
  select(null)
  const bytes = (drawing.images ?? []).reduce((n, i) => n + i.data.length, 0)
  const mb = bytes / (1024 * 1024)
  sendBtn.disabled = true
  sendBtn.dataset.busy = 'true'
  $('send-text').textContent = mb >= 1 ? `Sending ${mb.toFixed(1)} MB…` : 'Sending…'
  // no heartbeat while uploading: a ping overtaking a slow submit would make the submit look replayed
  clearInterval(heartbeat)
  try {
    // envelope ≈ 4/3 of the JSON; allow ~150 KB/s on a poor Wi-Fi link (the Mac waits up to 180 s)
    const r = await call({ type: 'submit', drawing }, Math.min(170_000, Math.max(60_000, (bytes * 4) / 3 / 150)))
    if (r.type !== 'ok') throw new Refused(typeof r.message === 'string' ? r.message : String(r.error))
    sent = true
    try {
      sessionStorage.removeItem(STORE_KEY)
    } catch {
      /* ignore */
    }
    void imageStore.prune(sessionId, true)
    setConn('sent')
    showOverlay('check', `Sent to ${APP_NAME}`, 'Your drawing is on the whiteboard. You can close this tab.', 'ok')
  } catch (e) {
    if (e instanceof Refused) {
      // the Mac answered but refused the drawing (e.g. validation): the connection itself is fine
      toast(`${APP_NAME} couldn’t accept this drawing: ${e.message.replace(/^Invalid drawing: /, '')}`)
    } else {
      onNetworkError(e)
      toast((conn as Conn) === 'closed' ? 'The session has closed — your drawing was not sent.' : `Couldn’t reach ${APP_NAME}. Check your Wi-Fi and try again.`)
    }
    if ((conn as Conn) !== 'closed') startHeartbeat()
  } finally {
    sending = false
    delete sendBtn.dataset.busy
    $('send-text').textContent = `Send to ${APP_NAME}`
    updateButtons()
  }
}

// ─── view (pan / zoom) ──────────────────────────────────────────────────────────────────────────────

const view = { x: 0, y: 0, k: 1 }
let dpr = 1

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 3)
  for (const c of [base, live]) {
    c.width = Math.round(stage.clientWidth * dpr)
    c.height = Math.round(stage.clientHeight * dpr)
  }
  renderBase()
  renderLive()
}

const toWorld = (sx: number, sy: number): [number, number] => [(sx - view.x) / view.k, (sy - view.y) / view.k]

function applyView(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y)
}

function viewChanged(): void {
  stage.style.backgroundPosition = `${view.x}px ${view.y}px`
  stage.style.backgroundSize = `${22 * view.k}px ${22 * view.k}px`
  const zoom = $('zoom')
  zoom.hidden = Math.abs(view.k - 1) < 0.01 && Math.abs(view.x) < 1 && Math.abs(view.y) < 1
  zoom.textContent = `${Math.round(view.k * 100)}%`
  renderBase()
  renderLive()
}

// ─── rendering ──────────────────────────────────────────────────────────────────────────────────────

// Dark mode shows ink inverted (like the Mac's sketch preview) but photos as they are, so ink colours are mapped here
// instead of filtering the whole canvas.
const darkQuery = matchMedia('(prefers-color-scheme: dark)')
const inkCache = new Map<string, string>()
const ink = (hex: string): string => {
  if (!darkQuery.matches) return hex
  let c = inkCache.get(hex)
  if (!c) inkCache.set(hex, (c = darkInk(hex)))
  return c
}

function drawStroke(ctx: CanvasRenderingContext2D, s: DrawStroke): void {
  const pts = s.points
  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.strokeStyle = ink(s.color)
  ctx.fillStyle = ink(s.color)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const widthAt = (p: number): number => (s.pressure && s.tool === 'pen' ? s.width * pressureFactor(p) : s.width)
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0][0], pts[0][1], widthAt(pts[0][2]) / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (s.straight || s.tool === 'highlighter' || !s.pressure) {
    // constant width: one path (keeps translucent highlighter strokes even)
    ctx.lineWidth = widthAt(average(pts.map((p) => p[2])))
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    if (pts.length === 2 || s.straight) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2
        const my = (pts[i][1] + pts[i + 1][1]) / 2
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    }
    ctx.stroke()
  } else {
    // pressure-sensitive: short smoothed segments, each with its own width
    let px = pts[0][0]
    let py = pts[0][1]
    for (let i = 1; i < pts.length; i++) {
      const last = i === pts.length - 1
      const mx = last ? pts[i][0] : (pts[i][0] + pts[i + 1][0]) / 2
      const my = last ? pts[i][1] : (pts[i][1] + pts[i + 1][1]) / 2
      ctx.lineWidth = widthAt((pts[i - 1][2] + pts[i][2]) / 2)
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
      ctx.stroke()
      px = mx
      py = my
    }
  }
  ctx.restore()
}

function drawImageItem(ctx: CanvasRenderingContext2D, it: ImageItem): void {
  const src = pixels.get(it.id)?.source
  if (src) {
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, it.x, it.y, it.width, it.height)
    return
  }
  // still loading (after a reload): a quiet placeholder
  ctx.save()
  ctx.fillStyle = darkQuery.matches ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
  ctx.fillRect(it.x, it.y, it.width, it.height)
  ctx.restore()
}

function renderBase(): void {
  baseCtx.setTransform(1, 0, 0, 1, 0, 0)
  baseCtx.clearRect(0, 0, base.width, base.height)
  applyView(baseCtx)
  for (const it of items) {
    if (isImage(it)) drawImageItem(baseCtx, it)
    else drawStroke(baseCtx, it)
  }
  $('hint').classList.toggle('gone', items.length > 0 || !!current)
}

const toScreen = (x: number, y: number): [number, number] => [x * view.k + view.x, y * view.k + view.y]

let liveQueued = false
function renderLive(): void {
  liveQueued = false
  liveCtx.setTransform(1, 0, 0, 1, 0, 0)
  liveCtx.clearRect(0, 0, live.width, live.height)
  if (current) {
    applyView(liveCtx)
    drawStroke(liveCtx, current.stroke)
  } else if (eraserAt) {
    liveCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    liveCtx.beginPath()
    liveCtx.arc(eraserAt[0], eraserAt[1], ERASER_RADIUS, 0, Math.PI * 2)
    liveCtx.strokeStyle = 'rgba(120,120,120,0.8)'
    liveCtx.lineWidth = 1.5
    liveCtx.stroke()
  }
  renderSelection()
}

/** Outline + corner handles of the selected image (screen space), and the floating Delete action. */
function renderSelection(): void {
  const it = selectedItem()
  const del = $('img-actions')
  if (!it) {
    del.hidden = true
    return
  }
  const pts = corners(it).map(([x, y]) => toScreen(x, y))
  liveCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const accent = darkQuery.matches ? '#8fb0ff' : '#3d6cf0'
  liveCtx.strokeStyle = accent
  liveCtx.lineWidth = 1.5
  liveCtx.beginPath()
  pts.forEach(([x, y], i) => (i ? liveCtx.lineTo(x, y) : liveCtx.moveTo(x, y)))
  liveCtx.closePath()
  liveCtx.stroke()
  for (const [x, y] of pts) {
    liveCtx.beginPath()
    liveCtx.arc(x, y, HANDLE_R, 0, Math.PI * 2)
    liveCtx.fillStyle = darkQuery.matches ? '#1f1f1f' : '#ffffff'
    liveCtx.fill()
    liveCtx.lineWidth = 2
    liveCtx.stroke()
  }
  // the action sits above the image (below it when the image touches the top bar), clamped into the screen
  del.hidden = !!manip
  const [x0, y0] = pts[0]
  const [x1, y1] = pts[2]
  const w = del.offsetWidth || 90
  const left = Math.min(Math.max(8, (x0 + x1) / 2 - w / 2), stage.clientWidth - w - 8)
  const top = y0 - 52 > 64 ? y0 - 52 : Math.min(y1 + 14, stage.clientHeight - 130)
  del.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
}
const queueLive = (): void => {
  if (!liveQueued) {
    liveQueued = true
    requestAnimationFrame(renderLive)
  }
}

// ─── history ────────────────────────────────────────────────────────────────────────────────────────

// snapshots of the item list (items are never mutated once committed, so snapshots share them)
const undoStack: Item[][] = []
const redoStack: Item[][] = []

function commit(next: Item[]): void {
  undoStack.push(items)
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
  items = next
  changed()
}

function changed(): void {
  if (selected && !selectedItem()) selected = null
  renderBase()
  queueLive()
  persist()
  updateButtons()
}

function undo(): void {
  if (manip || current) return
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(items)
  items = prev
  changed()
}

function redo(): void {
  if (manip || current) return
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(items)
  items = next
  changed()
}

// ─── images ─────────────────────────────────────────────────────────────────────────────────────────

let selected: string | null = null
const selectedItem = (): ImageItem | null => (selected ? ((items.find((it) => isImage(it) && it.id === selected) as ImageItem | undefined) ?? null) : null)

function select(id: string | null): void {
  if (selected === id) return
  selected = id
  queueLive()
}

/** Topmost image under a screen point. */
function imageAt(sx: number, sy: number): ImageItem | null {
  const [x, y] = toWorld(sx, sy)
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (isImage(it) && contains(it, x, y)) return it
  }
  return null
}

/** Corner handle of the selected image under a screen point (index into `corners`), or -1. */
function handleAt(sx: number, sy: number): number {
  const it = selectedItem()
  if (!it) return -1
  let best = -1
  let bestD = HANDLE_HIT
  corners(it).forEach(([x, y], i) => {
    const [hx, hy] = toScreen(x, y)
    const d = Math.hypot(hx - sx, hy - sy)
    if (d <= bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

interface Manip {
  id: number
  type: string
  image: string
  /** -1 = move, 0–3 = resize by that corner */
  corner: number
  start: [number, number]
  orig: ImageItem
  before: Item[]
  moved: boolean
}
let manip: Manip | null = null

function startManip(e: PointerEvent, it: ImageItem, corner: number): void {
  const [sx, sy] = local(e)
  select(it.id)
  manip = { id: e.pointerId, type: e.pointerType, image: it.id, corner, start: [sx, sy], orig: it, before: items, moved: false }
  $('hint').classList.add('gone')
  queueLive()
}

function moveManip(e: PointerEvent): void {
  const m = manip!
  const [sx, sy] = local(e)
  if (!m.moved && Math.hypot(sx - m.start[0], sy - m.start[1]) < 3) return
  m.moved = true
  let next: Rect
  if (m.corner < 0) {
    const dx = (sx - m.start[0]) / view.k
    const dy = (sy - m.start[1]) / view.k
    next = { x: m.orig.x + dx, y: m.orig.y + dy, width: m.orig.width, height: m.orig.height }
  } else {
    const [wx, wy] = toWorld(sx, sy)
    next = resizeFromCorner(m.orig, m.corner, wx, wy, 24 / view.k)
  }
  items = m.before.map((it) => (isImage(it) && it.id === m.image ? { ...it, x: round(next.x), y: round(next.y), width: round(next.width), height: round(next.height) } : it))
  queueBase()
  queueLive()
}

function endManip(keep = true): void {
  const m = manip
  if (!m) return
  manip = null
  if (m.moved && keep) {
    const after = items
    items = m.before
    commit(after)
  } else {
    items = m.before
    renderBase()
  }
  queueLive()
}

function deleteSelected(): void {
  const it = selectedItem()
  if (!it || manip) return
  selected = null
  commit(items.filter((x) => x !== it))
  toast('Image removed')
}

let imageNoteShown = false
const imageCount = (): number => items.filter(isImage).length
const imageBytes = (): number => items.reduce((n, it) => n + (isImage(it) ? base64Bytes(pixels.get(it.id)?.data ?? '') : 0), 0)

/** Adds image files (picker, paste, drop): re-encoded, centred in the current view, selected afterwards. */
async function insertImages(files: File[]): Promise<void> {
  if (sent || conn === 'taken') return
  const list = files.filter((f) => !f.type || f.type.startsWith('image/'))
  if (!list.length) return
  const room = DRAW_LIMITS.maxImages - imageCount()
  if (room <= 0) return toast(`You can add up to ${DRAW_LIMITS.maxImages} images to one drawing.`)
  if (list.length > room) toast(`Only ${room} more image${room === 1 ? '' : 's'} fit into this drawing.`)
  imageButton.disabled = true
  imageButton.dataset.busy = 'true'
  const added: ImageItem[] = []
  let failed = 0
  let tooBig = false
  let bytes = imageBytes()
  try {
    for (const file of list.slice(0, room)) {
      try {
        const enc = await encodeImage(file)
        const size = base64Bytes(enc.data)
        if (bytes + size > DRAW_LIMITS.maxTotalImageBytes) {
          tooBig = true
          continue
        }
        bytes += size
        const id = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        pixels.set(id, { mime: enc.mime, data: enc.data, source: enc.source })
        // natural size on a Retina screen, but at most 60 % of the visible area; cascade several images a little
        const visW = stage.clientWidth / view.k
        const visH = (stage.clientHeight - 150) / view.k
        const size2 = fitSize(enc.width / Math.max(1, dpr), enc.height / Math.max(1, dpr), visW * 0.6, visH * 0.6)
        const [cx, cy] = toWorld(stage.clientWidth / 2, (56 + stage.clientHeight - 90) / 2)
        const off = (added.length * 24) / view.k
        added.push({ kind: 'image', id, mime: enc.mime, x: round(cx - size2.width / 2 + off), y: round(cy - size2.height / 2 + off), width: round(size2.width), height: round(size2.height) })
        void imageStore.put(sessionId, id, enc.mime, enc.data).then((ok) => {
          if (!ok && !imageNoteShown) {
            imageNoteShown = true
            toast('Images can’t be saved on this iPad — they stay while this tab is open.')
          }
        })
      } catch (e) {
        console.warn('[sidera-draw] image import failed', e)
        failed++
      }
    }
  } finally {
    imageButton.disabled = false
    delete imageButton.dataset.busy
  }
  if (added.length) {
    if (ui.tool === 'eraser') {
      ui.tool = 'select'
      renderTools()
    }
    selected = added[added.length - 1].id
    commit([...items, ...added])
  }
  if (tooBig) toast('Some images were left out — the drawing is already at its size limit.')
  else if (failed) toast(failed === 1 ? 'That image couldn’t be opened.' : `${failed} images couldn’t be opened.`)
}

/** After a reload: bring back the pixels of saved images from IndexedDB (images that can't be restored are dropped). */
async function restoreImages(): Promise<void> {
  const missing: string[] = []
  await Promise.all(
    items.filter(isImage).map(async (it) => {
      const row = await imageStore.get(sessionId, it.id)
      if (!row) return missing.push(it.id)
      pixels.set(it.id, { mime: row.mime, data: row.data, source: null })
      try {
        pixels.set(it.id, { mime: row.mime, data: row.data, source: await imageFromBase64(row.mime, row.data) })
      } catch {
        missing.push(it.id)
      }
    })
  )
  if (missing.length) {
    items = items.filter((it) => !(isImage(it) && missing.includes(it.id)))
    persist()
    toast(missing.length === 1 ? 'An image couldn’t be restored after the reload.' : `${missing.length} images couldn’t be restored after the reload.`)
  }
  renderBase()
  updateButtons()
}

let baseQueued = false
const queueBase = (): void => {
  if (!baseQueued) {
    baseQueued = true
    requestAnimationFrame(() => {
      baseQueued = false
      renderBase()
    })
  }
}

// ─── input ──────────────────────────────────────────────────────────────────────────────────────────

interface Current {
  id: number
  type: string
  stroke: DrawStroke
  holdTimer: number
  holdAnchor: [number, number]
}
let current: Current | null = null
let penSeen = false
let penUpAt = 0
let eraserAt: [number, number] | null = null
let erasing: { id: number; before: Item[]; removed: boolean } | null = null
/** Select tool: one pointer on empty canvas pans */
let panning: { id: number; type: string; sx: number; sy: number; vx: number; vy: number } | null = null
const touches = new Map<number, { x: number; y: number }>()
let gesture: { d0: number; k0: number; wx: number; wy: number } | null = null

const fingerDraws = (): boolean => ui.finger === 'on' || (ui.finger === 'auto' && !penSeen)
const local = (e: PointerEvent): [number, number] => {
  const r = stage.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}
const pressureOf = (e: PointerEvent): number => (e.pointerType === 'pen' ? Math.max(0.02, Math.min(1, e.pressure || 0.5)) : 0.5)
const round = (n: number, d = 100): number => Math.round(n * d) / d

function startStroke(e: PointerEvent): void {
  const [sx, sy] = local(e)
  if (ui.tool === 'eraser') {
    erasing = { id: e.pointerId, before: items, removed: false }
    eraserAt = [sx, sy]
    eraseAt(sx, sy)
    queueLive()
    return
  }
  const tool = ui.tool === 'highlighter' ? 'highlighter' : 'pen'
  const [x, y] = toWorld(sx, sy)
  current = {
    id: e.pointerId,
    type: e.pointerType,
    holdTimer: 0,
    holdAnchor: [sx, sy],
    stroke: {
      tool,
      color: ui.color[tool],
      width: WIDTHS[tool][ui.width[tool]],
      opacity: tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1,
      points: [[round(x), round(y), round(pressureOf(e), 1000)]],
      ...(e.pointerType === 'pen' ? { pressure: true } : {})
    }
  }
  armHold()
  $('hint').classList.add('gone')
  queueLive()
}

/** Apple-Notes-style: keep the pen still for a moment at the end of a stroke to snap it to a straight line. */
function armHold(): void {
  if (!current) return
  clearTimeout(current.holdTimer)
  current.holdTimer = window.setTimeout(() => {
    const c = current
    if (!c || c.stroke.straight) return
    const pts = c.stroke.points as Pt[]
    if (!isRoughlyStraight(pts, 24 / view.k, 10 / view.k)) return
    const p = average(pts.map((q) => q[2]))
    c.stroke = { ...c.stroke, straight: true, points: [[pts[0][0], pts[0][1], round(p, 1000)], [...pts[pts.length - 1]] as Pt] }
    c.stroke.points[1][2] = round(p, 1000)
    queueLive()
  }, HOLD_MS)
}

function extendStroke(e: PointerEvent): void {
  const c = current!
  const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
  for (const ev of events.length ? events : [e]) {
    const [sx, sy] = local(ev)
    const [x, y] = toWorld(sx, sy)
    const p = round(pressureOf(ev), 1000)
    if (c.stroke.straight) {
      // after snapping, the end point follows the pen so the line can still be adjusted
      c.stroke.points[1] = [round(x), round(y), c.stroke.points[1][2]]
      continue
    }
    const last = c.stroke.points[c.stroke.points.length - 1]
    if (Math.hypot(x - last[0], y - last[1]) * view.k < 0.75) {
      last[2] = Math.max(last[2], p)
      continue
    }
    c.stroke.points.push([round(x), round(y), p])
    if (Math.hypot(sx - c.holdAnchor[0], sy - c.holdAnchor[1]) > HOLD_SLOP) {
      c.holdAnchor = [sx, sy]
      armHold()
    }
  }
  queueLive()
}

function endStroke(keep = true): void {
  const c = current
  if (!c) return
  clearTimeout(c.holdTimer)
  current = null
  if (keep) commit([...items, c.stroke])
  queueLive()
  renderBase()
}

function eraseAt(sx: number, sy: number): void {
  const [x, y] = toWorld(sx, sy)
  const r = ERASER_RADIUS / view.k
  // the eraser only removes strokes: images go via their Delete action
  const keep = items.filter((s) => {
    if (isImage(s)) return true
    const half = (s.pressure && s.tool === 'pen' ? s.width * pressureFactor(1) : s.width) / 2
    return !hitsStroke(s.points as Pt[], half, x, y, r)
  })
  if (keep.length !== items.length) {
    items = keep
    if (erasing) erasing.removed = true
    renderBase()
  }
}

function endErase(): void {
  if (erasing?.removed) {
    const after = items
    items = erasing.before
    commit(after)
  }
  erasing = null
  eraserAt = null
  queueLive()
}

function startGesture(): void {
  const [a, b] = [...touches.values()]
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const [wx, wy] = toWorld(mx, my)
  gesture = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), k0: view.k, wx, wy }
}

function moveGesture(): void {
  if (!gesture || touches.size < 2) return
  const [a, b] = [...touches.values()]
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  view.k = Math.min(4, Math.max(0.25, (gesture.k0 * Math.hypot(a.x - b.x, a.y - b.y)) / gesture.d0))
  view.x = mx - gesture.wx * view.k
  view.y = my - gesture.wy * view.k
  viewChanged()
}

const capture = (e: PointerEvent): void => {
  try {
    stage.setPointerCapture(e.pointerId)
  } catch {
    // pointer already gone (or synthetic): work without capture
  }
}

/** Grab the selected image's corner handle or the topmost image under the pointer. */
function grab(e: PointerEvent): boolean {
  const [sx, sy] = local(e)
  const h = handleAt(sx, sy)
  const it = h >= 0 ? selectedItem() : imageAt(sx, sy)
  if (!it) return false
  capture(e)
  startManip(e, it, h)
  return true
}

function startPan(e: PointerEvent): void {
  const [sx, sy] = local(e)
  capture(e)
  panning = { id: e.pointerId, type: e.pointerType, sx, sy, vx: view.x, vy: view.y }
}

stage.addEventListener('pointerdown', (e) => {
  if (sent || conn === 'taken') return
  closePopovers()
  if (e.pointerType === 'pen') {
    penSeen = true
    updateFinger()
    // a pen always wins over a finger stroke, gesture or image drag that may have started from the resting hand
    if (current && current.type === 'touch') endStroke(false)
    if (manip && manip.type === 'touch') endManip(false)
    if (panning && panning.type === 'touch') panning = null
    gesture = null
  }
  if (e.pointerType === 'touch') {
    const [x, y] = local(e)
    touches.set(e.pointerId, { x, y })
    // palm rejection: while (or right after) the pen is drawing, touches are ignored entirely
    if ((current && current.type === 'pen') || (manip && manip.type !== 'touch') || Date.now() - penUpAt < 300) return
    if (touches.size === 2) {
      // second finger: this is a pan / pinch, not a drawing — drop a short finger stroke that just started
      if (current && current.type === 'touch') endStroke(current.stroke.points.length > 12)
      if (erasing) endErase()
      if (manip) endManip(true)
      panning = null
      startGesture()
      return
    }
    if (touches.size > 2 || current || erasing || manip || panning) return
    if ((e.width || 0) > PALM_SIZE || (e.height || 0) > PALM_SIZE) return
    // fingers that don't draw (palm rejection / finger drawing off) still select, move and resize images
    if (!fingerDraws() || ui.tool === 'select') {
      if (grab(e)) return
      if (ui.tool === 'select') startPan(e)
      else select(null)
      return
    }
  } else if (e.pointerType === 'mouse' && e.button !== 0) return
  if (current || erasing || manip || panning) return
  if (ui.tool === 'select') {
    if (!grab(e)) {
      select(null)
      startPan(e)
    }
    return
  }
  // drawing tools draw over images; only the selected image's corner handles stay grabbable
  const [sx, sy] = local(e)
  const h = handleAt(sx, sy)
  if (h >= 0) {
    capture(e)
    startManip(e, selectedItem()!, h)
    return
  }
  select(null)
  capture(e)
  startStroke(e)
})

stage.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const [x, y] = local(e)
    touches.set(e.pointerId, { x, y })
    if (gesture) return moveGesture()
  }
  if (current && e.pointerId === current.id) return extendStroke(e)
  if (manip && e.pointerId === manip.id) return moveManip(e)
  if (panning && e.pointerId === panning.id) {
    const [sx, sy] = local(e)
    view.x = panning.vx + sx - panning.sx
    view.y = panning.vy + sy - panning.sy
    return viewChanged()
  }
  if (erasing && e.pointerId === erasing.id) {
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
    for (const ev of events.length ? events : [e]) {
      const [sx, sy] = local(ev)
      eraseAt(sx, sy)
      eraserAt = [sx, sy]
    }
    queueLive()
  }
})

const pointerEnd = (e: PointerEvent): void => {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId)
    if (touches.size < 2) gesture = null
  }
  if (e.pointerType === 'pen') penUpAt = Date.now()
  if (current && e.pointerId === current.id) endStroke(true)
  if (erasing && e.pointerId === erasing.id) endErase()
  if (manip && e.pointerId === manip.id) endManip(e.type !== 'pointercancel')
  if (panning && e.pointerId === panning.id) panning = null
}
stage.addEventListener('pointerup', pointerEnd)
stage.addEventListener('pointercancel', pointerEnd)

// desktop testing: wheel pans, ctrl/pinch-wheel zooms
stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault()
    const r = stage.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    if (e.ctrlKey) {
      const [wx, wy] = toWorld(mx, my)
      view.k = Math.min(4, Math.max(0.25, view.k * Math.exp(-e.deltaY / 200)))
      view.x = mx - wx * view.k
      view.y = my - wy * view.k
    } else {
      view.x -= e.deltaX
      view.y -= e.deltaY
    }
    viewChanged()
  },
  { passive: false }
)

// iOS Safari: no page pinch-zoom, magnifier, double-tap zoom or rubber-banding
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault())
stage.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })
stage.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())

// ─── toolbar ────────────────────────────────────────────────────────────────────────────────────────

/** tools without colour / width */
const noInk = (): boolean => ui.tool === 'eraser' || ui.tool === 'select'
const swatches = $('swatches')
const widths = $('widths')

function renderTools(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]')) {
    b.setAttribute('role', 'radio')
    b.setAttribute('aria-checked', String(b.dataset.tool === ui.tool))
  }
  const kind = ui.tool === 'highlighter' ? 'highlighter' : 'pen'
  swatches.replaceChildren(
    ...COLORS[kind].map((c) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'swatch'
      b.title = c.name
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-label', c.name)
      b.setAttribute('aria-checked', String(!noInk() && ui.color[kind] === c.hex))
      b.disabled = noInk()
      b.style.opacity = noInk() ? '0.35' : ''
      const dot = document.createElement('i')
      dot.style.setProperty('--c', c.hex)
      if (kind === 'highlighter') dot.style.opacity = '0.75'
      b.append(dot)
      b.addEventListener('click', () => {
        ui.color[kind] = c.hex
        renderTools()
      })
      return b
    })
  )
  widths.replaceChildren(
    ...WIDTHS[kind].map((w, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'width'
      b.title = ['Fine', 'Medium', 'Bold'][i]
      b.setAttribute('role', 'radio')
      b.setAttribute('aria-label', b.title)
      b.setAttribute('aria-checked', String(!noInk() && ui.width[kind] === i))
      b.disabled = noInk()
      b.style.opacity = noInk() ? '0.35' : ''
      const dot = document.createElement('i')
      dot.style.setProperty('--d', `${[5, 9, 14][i]}px`)
      b.append(dot)
      b.addEventListener('click', () => {
        ui.width[kind] = i
        renderTools()
      })
      return b
    })
  )
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))
  b.addEventListener('click', () => {
    ui.tool = b.dataset.tool as Tool
    renderTools()
  })

function updateFinger(): void {
  const label = ui.finger === 'auto' ? (penSeen ? 'Auto · off' : 'Auto') : ui.finger === 'on' ? 'On' : 'Off'
  $('finger-text').textContent = `Finger: ${label}`
  $('finger').dataset.on = String(ui.finger === 'on')
  $('finger').title =
    ui.finger === 'auto'
      ? 'Finger drawing turns off automatically once Apple Pencil is used (tap to change)'
      : ui.finger === 'on'
        ? 'Fingers always draw (tap to change)'
        : 'Fingers never draw — only pan & zoom (tap to change)'
}

$('finger').addEventListener('click', () => {
  ui.finger = ui.finger === 'auto' ? 'on' : ui.finger === 'on' ? 'off' : 'auto'
  updateFinger()
  toast(ui.finger === 'auto' ? 'Finger drawing: automatic (off once a pencil is used)' : ui.finger === 'on' ? 'Finger drawing: on' : 'Finger drawing: off')
})

$('zoom').addEventListener('click', () => {
  view.x = view.y = 0
  view.k = 1
  viewChanged()
})

const imageButton = $<HTMLButtonElement>('image')
const fileInput = $<HTMLInputElement>('file')
imageButton.addEventListener('click', () => {
  closePopovers()
  // iPadOS offers Photo Library, Take Photo and Files for accept="image/*"
  fileInput.value = ''
  fileInput.click()
})
fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])]
  fileInput.value = ''
  void insertImages(files)
})
$('img-delete').addEventListener('click', deleteSelected)

// paste (⌘V with a keyboard, or the system paste menu) and drag & drop (split view / desktop testing)
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.items ?? [])].flatMap((i) => (i.kind === 'file' && i.type.startsWith('image/') ? [i.getAsFile()!].filter(Boolean) : []))
  if (!files.length) return
  e.preventDefault()
  void insertImages(files)
})
const hasFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes('Files')
stage.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})
stage.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  void insertImages([...(e.dataTransfer?.files ?? [])])
})

$('undo').addEventListener('click', undo)
$('redo').addEventListener('click', redo)
$('clear').addEventListener('click', () => {
  closePopovers()
  if (items.length) $('confirm').hidden = false
})
$('confirm-cancel').addEventListener('click', closePopovers)
$('confirm-ok').addEventListener('click', () => {
  closePopovers()
  commit([])
})
sendBtn.addEventListener('click', () => void send())

statusBtn.addEventListener('click', () => {
  const open = $('session').hidden
  closePopovers()
  $('session').hidden = !open
  $('session-end').hidden = conn !== 'connected' && conn !== 'offline'
})
$('session-close').addEventListener('click', closePopovers)
$('session-end').addEventListener('click', () => {
  closePopovers()
  clearInterval(heartbeat)
  void call({ type: 'bye' }, 5000).catch(() => undefined)
  setConn('closed')
  showOverlay('info', 'Session ended', `The connection to ${APP_NAME} is closed. Your drawing was not sent.`)
})

function closePopovers(): void {
  $('confirm').hidden = true
  $('session').hidden = true
}

function updateButtons(): void {
  $<HTMLButtonElement>('undo').disabled = !undoStack.length
  $<HTMLButtonElement>('redo').disabled = !redoStack.length
  $<HTMLButtonElement>('clear').disabled = !items.length
  sendBtn.disabled = !items.length || conn !== 'connected' || sent || sending
}

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if ((e.key === 'Backspace' || e.key === 'Delete') && selected) {
    e.preventDefault()
    deleteSelected()
  } else if (e.key === 'Escape') select(null)
})

let toastTimer = 0
function toast(text: string): void {
  const t = $('toast')
  t.textContent = text
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (t.hidden = true), 3200)
}

const ICONS: Record<string, string> = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
}

function showOverlay(icon: keyof typeof ICONS, title: string, text: string, kind = ''): void {
  $('overlay-icon').innerHTML = ICONS[icon]
  $('overlay-icon').dataset.kind = kind
  $('overlay-title').textContent = title
  $('overlay-text').textContent = text
  $('overlay').hidden = false
}

// ─── boot ───────────────────────────────────────────────────────────────────────────────────────────

document.title = `${APP_NAME} Draw`
darkQuery.addEventListener('change', () => {
  inkCache.clear()
  renderBase()
  queueLive()
})
void imageStore.prune(sessionId)
if (items.some(isImage)) void restoreImages()
new ResizeObserver(resize).observe(stage)
renderTools()
updateFinger()
resize()
updateButtons()

if (!key || !sessionId) {
  setConn('nokey')
  showOverlay('info', 'Scan the code again', `This page needs the QR code from ${APP_NAME}. Choose “Draw on iPad” on a whiteboard and scan the code with your camera.`)
} else if (sent) {
  setConn('sent')
  showOverlay('check', `Sent to ${APP_NAME}`, 'Your drawing is on the whiteboard. You can close this tab.', 'ok')
} else {
  setConn('connecting')
  void hello()
}
