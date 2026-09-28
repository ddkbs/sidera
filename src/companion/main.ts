/**
 * Sidera Draw — the iPad companion page. Served by the Mac over the LAN (plain HTTP), bundled into one
 * self-contained HTML file by scripts/build-companion.mjs. Everything sent to the Mac is end-to-end encrypted
 * with the key from the URL fragment (see src/shared/drawProtocol.ts).
 */
import { APP_NAME } from '../shared/brand'
import { DRAW_HEARTBEAT_MS, fromB64u, open, seal, type DrawStroke, type DrawSubmission, type Message } from '../shared/drawProtocol'
import { average, hitsStroke, isRoughlyStraight, pressureFactor, type Pt } from './geometry'

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

type Tool = 'pen' | 'highlighter' | 'eraser'
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

interface Saved {
  k: string
  t?: string
  s?: number
  r?: number
  strokes?: DrawStroke[]
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
let strokes: DrawStroke[] = saved?.k === keyB64 ? (saved?.strokes ?? []) : []
let sent = saved?.sent === true

let saveTimer = 0
function persist(now = false): void {
  const write = (): void => {
    saveTimer = 0
    if (!keyB64) return
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ k: keyB64, t: token, s: seq, r: lastS2c, strokes, sent } satisfies Saved))
    } catch {
      // storage full: the drawing still exists in memory
    }
  }
  clearTimeout(saveTimer)
  if (now) write()
  else saveTimer = window.setTimeout(write, 300)
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

async function send(): Promise<void> {
  if (!strokes.length || conn !== 'connected') return
  sendBtn.disabled = true
  $('send-text').textContent = 'Sending…'
  const drawing: DrawSubmission = { width: Math.round(stage.clientWidth), height: Math.round(stage.clientHeight), strokes }
  try {
    const r = await call({ type: 'submit', drawing }, 60_000)
    if (r.type !== 'ok') throw new Error(typeof r.message === 'string' ? r.message : String(r.error))
    sent = true
    clearInterval(heartbeat)
    try {
      sessionStorage.removeItem(STORE_KEY)
    } catch {
      /* ignore */
    }
    setConn('sent')
    showOverlay('check', `Sent to ${APP_NAME}`, 'Your drawing is on the whiteboard. You can close this tab.', 'ok')
  } catch (e) {
    onNetworkError(e)
    toast((conn as Conn) === 'closed' ? 'The session has closed — your drawing was not sent.' : `Couldn’t reach ${APP_NAME}. Check your Wi-Fi and try again.`)
  } finally {
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

function drawStroke(ctx: CanvasRenderingContext2D, s: DrawStroke): void {
  const pts = s.points
  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
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

function renderBase(): void {
  baseCtx.setTransform(1, 0, 0, 1, 0, 0)
  baseCtx.clearRect(0, 0, base.width, base.height)
  applyView(baseCtx)
  for (const s of strokes) drawStroke(baseCtx, s)
  $('hint').classList.toggle('gone', strokes.length > 0 || !!current)
}

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
}
const queueLive = (): void => {
  if (!liveQueued) {
    liveQueued = true
    requestAnimationFrame(renderLive)
  }
}

// ─── history ────────────────────────────────────────────────────────────────────────────────────────

const undoStack: DrawStroke[][] = []
const redoStack: DrawStroke[][] = []

function commit(next: DrawStroke[]): void {
  undoStack.push(strokes)
  if (undoStack.length > 200) undoStack.shift()
  redoStack.length = 0
  strokes = next
  changed()
}

function changed(): void {
  renderBase()
  persist()
  updateButtons()
}

function undo(): void {
  const prev = undoStack.pop()
  if (!prev) return
  redoStack.push(strokes)
  strokes = prev
  changed()
}

function redo(): void {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(strokes)
  strokes = next
  changed()
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
let erasing: { id: number; before: DrawStroke[]; removed: boolean } | null = null
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
    erasing = { id: e.pointerId, before: strokes, removed: false }
    eraserAt = [sx, sy]
    eraseAt(sx, sy)
    queueLive()
    return
  }
  const tool = ui.tool
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
  if (keep) commit([...strokes, c.stroke])
  queueLive()
  renderBase()
}

function eraseAt(sx: number, sy: number): void {
  const [x, y] = toWorld(sx, sy)
  const r = ERASER_RADIUS / view.k
  const keep = strokes.filter((s) => {
    const half = (s.pressure && s.tool === 'pen' ? s.width * pressureFactor(1) : s.width) / 2
    return !hitsStroke(s.points as Pt[], half, x, y, r)
  })
  if (keep.length !== strokes.length) {
    strokes = keep
    if (erasing) erasing.removed = true
    renderBase()
  }
}

function endErase(): void {
  if (erasing?.removed) {
    const after = strokes
    strokes = erasing.before
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

stage.addEventListener('pointerdown', (e) => {
  if (sent || conn === 'taken') return
  closePopovers()
  if (e.pointerType === 'pen') {
    penSeen = true
    updateFinger()
    // a pen always wins over a finger stroke or gesture that may have started from the resting hand
    if (current && current.type === 'touch') endStroke(false)
    gesture = null
  }
  if (e.pointerType === 'touch') {
    const [x, y] = local(e)
    touches.set(e.pointerId, { x, y })
    // palm rejection: while (or right after) the pen is drawing, touches are ignored entirely
    if ((current && current.type === 'pen') || Date.now() - penUpAt < 300) return
    if (touches.size === 2) {
      // second finger: this is a pan / pinch, not a drawing — drop a short finger stroke that just started
      if (current && current.type === 'touch') endStroke(current.stroke.points.length > 12)
      if (erasing) endErase()
      startGesture()
      return
    }
    if (touches.size > 2 || current || erasing || !fingerDraws()) return
    if ((e.width || 0) > PALM_SIZE || (e.height || 0) > PALM_SIZE) return
  } else if (e.pointerType === 'mouse' && e.button !== 0) return
  if (current || erasing) return
  stage.setPointerCapture(e.pointerId)
  startStroke(e)
})

stage.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const [x, y] = local(e)
    touches.set(e.pointerId, { x, y })
    if (gesture) return moveGesture()
  }
  if (current && e.pointerId === current.id) return extendStroke(e)
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
      b.setAttribute('aria-checked', String(ui.tool !== 'eraser' && ui.color[kind] === c.hex))
      b.disabled = ui.tool === 'eraser'
      b.style.opacity = ui.tool === 'eraser' ? '0.35' : ''
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
      b.setAttribute('aria-checked', String(ui.tool !== 'eraser' && ui.width[kind] === i))
      b.disabled = ui.tool === 'eraser'
      b.style.opacity = ui.tool === 'eraser' ? '0.35' : ''
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

$('undo').addEventListener('click', undo)
$('redo').addEventListener('click', redo)
$('clear').addEventListener('click', () => {
  closePopovers()
  if (strokes.length) $('confirm').hidden = false
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
  $<HTMLButtonElement>('clear').disabled = !strokes.length
  sendBtn.disabled = !strokes.length || conn !== 'connected' || sent
}

window.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  }
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
