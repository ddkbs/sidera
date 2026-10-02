import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, relative, sep } from 'node:path'
import type { Duplex } from 'node:stream'
import type { ApiMethod, DbChangeScope } from '@shared/api'
import { HANDSHAKE_NONCE_BYTES, KEY_BYTES, SecureChannel, fromB64u, toB64u, type Message } from '@shared/sync/crypto'
import {
  HEARTBEAT_MS,
  MAX_CALL_BYTES,
  MAX_FRAME_BYTES,
  PAIRING_ID_BYTES,
  PAIRING_TTL_MS,
  SYNC_PATH,
  cleanDeviceName,
  pairingUrl,
  parseHello,
  writeScopes,
  type BoardRef,
  type HelloFrame,
  type MirroredSettings,
  type RejectReason,
  type ServerMessage
} from '@shared/sync/protocol'
import type { Services } from '../services'
import type { DeviceStore } from './devices'
import { BoardScope, PolicyError } from './policy'
import { acceptWebSocket, type WsConnection } from './websocket'

/**
 * Sidera for iPad — the LAN server of one Session. Serves the static iPad web app (a second build of the real renderer,
 * see vite.ipad.config.ts) and one WebSocket endpoint that carries the end-to-end encrypted sync protocol
 * (shared/sync). Bound to one private LAN address, only while a whiteboard is shared. No Electron imports, so it runs
 * in plain Node tests.
 */

export interface IpadServerOptions {
  /** private LAN IPv4 to bind to */
  address: string
  port: number
  /** Bonjour name, e.g. "ddkbs-MacBook-Pro.local" (null = IP only) */
  bonjourHost: string | null
  /** human name of the Mac, shown on the iPad inside the encrypted channel */
  macName: string
  /** built iPad web app (out/ipad); null = API only (tests) */
  staticDir: string | null
  devices: DeviceStore
  services: Services
  /** runs one whitelisted, policy-checked CanvasApi call (Session handlers) */
  call: (method: ApiMethod, args: unknown[]) => Promise<unknown>
  /** bytes of an imported file (already scope-checked) */
  readFile: (fileId: string) => Promise<{ mime: string; bytes: Buffer } | null>
  settings: () => MirroredSettings
  /** a device changed data: tell the desktop window (and other devices) */
  onWrite: (scopes: DbChangeScope[]) => void
  /** connections / devices changed */
  onStatus: () => void
  log?: (msg: string) => void
}

const HELLO_TIMEOUT_MS = 10_000
/** frame cap until the device has authenticated: hello / auth / pair messages are tiny, so strangers can't make us buffer megabytes */
const PREAUTH_FRAME_BYTES = 8 * 1024
const IDLE_TIMEOUT_MS = HEARTBEAT_MS * 4
const MAX_CONNECTIONS = 8
const MAX_CONNECTIONS_PER_IP = 4
/** auth failures per IP within the window before that IP is ignored for the window */
const MAX_AUTH_FAILURES = 8
const FAILURE_WINDOW_MS = 5 * 60_000
/** token bucket per connection: burst / refill per second */
const CALL_BURST = 300
const CALL_RATE = 60
/** heavier calls: max per minute per connection */
const HEAVY_PER_MINUTE: Partial<Record<ApiMethod | 'file', number>> = { importFileData: 30, fetchLinkPreview: 20, clipUrl: 10, file: 240 }
/** files larger than this are not sent to the iPad (frame cap) */
const MAX_FILE_BYTES = 20 * 1024 * 1024

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm'
}

/** Every servable file of the built app, by URL path. Lookup is exact: no path ever comes from the request. */
function scanStatic(dir: string): Map<string, { file: string; mime: string }> {
  const out = new Map<string, { file: string; mime: string }>()
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const mime = STATIC_MIME[extname(name).toLowerCase()]
        if (mime && !name.endsWith('.map')) out.set('/' + relative(dir, full).split(sep).join('/'), { file: full, mime })
      }
    }
  }
  walk(dir)
  return out
}

export function appHeaders(host: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ws://${host}`,
    "worker-src 'self' blob:",
    'frame-src blob:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  }
}

class Conn {
  channel: SecureChannel | null = null
  deviceId: string | null = null
  name = 'iPad'
  scope: BoardScope | null = null
  lastSeen = Date.now()
  tokens = CALL_BURST
  refilledAt = Date.now()
  heavy = new Map<string, number[]>()
  constructor(
    readonly ws: WsConnection,
    readonly ip: string
  ) {}

  send(msg: ServerMessage): void {
    if (this.channel) this.ws.send(JSON.stringify(this.channel.seal(msg)))
  }

  /** token bucket + per-minute caps for heavy calls */
  allow(kind: string): boolean {
    const now = Date.now()
    this.tokens = Math.min(CALL_BURST, this.tokens + ((now - this.refilledAt) / 1000) * CALL_RATE)
    this.refilledAt = now
    if (this.tokens < 1) return false
    this.tokens--
    const cap = HEAVY_PER_MINUTE[kind as ApiMethod]
    if (cap) {
      const recent = (this.heavy.get(kind) ?? []).filter((t) => now - t < 60_000)
      if (recent.length >= cap) return false
      recent.push(now)
      this.heavy.set(kind, recent)
    }
    return true
  }
}

export class IpadServer {
  private server: Server
  private files: Map<string, { file: string; mime: string }>
  private conns = new Set<Conn>()
  private pairings = new Map<string, { key: Uint8Array; expiresAt: number }>()
  private failures = new Map<string, number[]>()
  private board: BoardRef | null = null
  private watchdog: NodeJS.Timeout | null = null
  private closing: Promise<void> | null = null
  private log: (msg: string) => void
  private allowedHosts = new Set<string>()

  private constructor(private opts: IpadServerOptions) {
    this.log = opts.log ?? ((m) => console.log(`[sidera-ipad] ${m}`))
    this.files = opts.staticDir ? scanStatic(opts.staticDir) : new Map()
    this.server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, keepAliveTimeout: 5_000, maxHeaderSize: 8192 }, (req, res) => this.handle(req, res))
    this.server.on('upgrade', (req, socket, head) => this.upgrade(req, socket, head))
    this.server.on('clientError', (_e, socket) => socket.destroy())
  }

  /** Binds to `address:port`. Rejects if impossible (port in use, address gone). */
  static async start(opts: IpadServerOptions): Promise<IpadServer> {
    const s = new IpadServer(opts)
    await new Promise<void>((resolve, reject) => {
      s.server.once('error', reject)
      s.server.listen(opts.port, opts.address, () => {
        s.server.off('error', reject)
        resolve()
      })
    })
    const port = s.port
    s.allowedHosts = new Set([`${opts.address}:${port}`, ...(opts.bonjourHost ? [`${opts.bonjourHost.toLowerCase()}:${port}`] : [])])
    s.watchdog = setInterval(() => s.tick(), 5_000)
    s.log(`listening on ${opts.address}:${opts.port}`)
    return s
  }

  get port(): number {
    return (this.server.address() as { port: number } | null)?.port ?? this.opts.port
  }

  get origin(): string {
    return `http://${this.opts.bonjourHost ?? this.opts.address}:${this.port}`
  }

  get ipOrigin(): string {
    return `http://${this.opts.address}:${this.port}`
  }

  get connected(): { id: string; name: string }[] {
    return [...this.conns].filter((c) => c.deviceId).map((c) => ({ id: c.deviceId!, name: c.name }))
  }

  get currentBoard(): BoardRef | null {
    return this.board
  }

  /** Which board the iPad shows; pushed to every connected device. */
  setBoard(board: BoardRef | null): void {
    this.board = board
    for (const c of this.conns) {
      if (!c.deviceId) continue
      c.scope = board ? new BoardScope(this.opts.services, board.id) : null
      c.send({ type: 'board', board })
    }
  }

  /** Data changed somewhere (desktop, MCP, another device): devices refetch. */
  notifyChanged(scopes: DbChangeScope[]): void {
    if (!scopes.length) return
    for (const c of this.conns) {
      if (!c.deviceId) continue
      c.scope?.invalidate()
      c.send({ type: 'changed', scopes })
    }
  }

  pushSettings(settings: MirroredSettings): void {
    for (const c of this.conns) if (c.deviceId) c.send({ type: 'settings', settings })
  }

  /** New one-time pairing (the previous unused one stays valid until it expires). */
  createPairing(): { url: string; ipUrl: string; expiresAt: number } {
    const id = toB64u(randomBytes(PAIRING_ID_BYTES))
    const key = new Uint8Array(randomBytes(KEY_BYTES))
    const expiresAt = Date.now() + PAIRING_TTL_MS
    this.pairings.set(id, { key, expiresAt })
    return { url: pairingUrl(this.origin, id, key), ipUrl: pairingUrl(this.ipOrigin, id, key), expiresAt }
  }

  /** Drops every connection of a revoked device right away. */
  disconnectDevice(deviceId: string): void {
    for (const c of this.conns) if (c.deviceId === deviceId) c.ws.close(4403, 'revoked')
  }

  close(reason: string): Promise<void> {
    if (this.closing) return this.closing
    if (this.watchdog) clearInterval(this.watchdog)
    this.watchdog = null
    for (const c of this.conns) c.ws.close(4000, reason)
    this.conns.clear()
    this.pairings.clear()
    this.closing = new Promise<void>((r) => this.server.close(() => r()))
    this.server.closeAllConnections()
    this.log(`closed (${reason})`)
    return this.closing
  }

  private tick(): void {
    const now = Date.now()
    for (const [id, p] of this.pairings) if (p.expiresAt < now) this.pairings.delete(id)
    for (const [ip, list] of this.failures) {
      const recent = list.filter((t) => now - t < FAILURE_WINDOW_MS)
      if (recent.length) this.failures.set(ip, recent)
      else this.failures.delete(ip)
    }
    for (const c of this.conns) if (now - c.lastSeen > IDLE_TIMEOUT_MS) c.ws.close(4008, 'idle')
  }

  // ─── HTTP: the static app ─────────────────────────────────────────────────────────────────────────

  private hostOk(req: IncomingMessage): string | null {
    // DNS-rebinding guard: only requests addressed to our own name / socket
    const host = (req.headers.host ?? '').toLowerCase()
    return this.allowedHosts.has(host) ? host : null
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const plain = (status: number): void => {
      res.writeHead(status, { 'Content-Length': '0', 'Cache-Control': 'no-store', Connection: 'close' })
      res.end()
    }
    if (this.closing) return plain(404)
    const host = this.hostOk(req)
    if (!host) return plain(404)
    if (req.method !== 'GET' && req.method !== 'HEAD') return plain(405)
    const path = (req.url ?? '/').split('?')[0]
    // a rebuilt app (new hashed asset names) is picked up on the next page load, without restarting the server
    if ((path === '/' || path === '/index.html') && this.opts.staticDir) this.files = scanStatic(this.opts.staticDir)
    const entry = path === '/' || path === '/index.html' ? this.files.get('/ipad.html') : this.files.get(path)
    if (!entry) return plain(404)
    let body: Buffer
    try {
      body = readFileSync(entry.file)
    } catch {
      return plain(404)
    }
    const html = entry.mime.startsWith('text/html')
    res.writeHead(200, {
      ...appHeaders(host),
      'Content-Type': entry.mime,
      'Content-Length': String(body.length),
      // hashed bundle files never change; the page itself always revalidates
      'Cache-Control': html || !path.startsWith('/assets/') ? 'no-cache' : 'public, max-age=31536000, immutable'
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  }

  // ─── WebSocket: the encrypted channel ─────────────────────────────────────────────────────────────

  private blocked(ip: string): boolean {
    return (this.failures.get(ip)?.length ?? 0) >= MAX_AUTH_FAILURES
  }

  private authFailure(ip: string): void {
    const list = this.failures.get(ip) ?? []
    list.push(Date.now())
    this.failures.set(ip, list)
    this.log(`rejected connection from ${ip} (${list.length}/${MAX_AUTH_FAILURES})`)
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const ip = (socket as { remoteAddress?: string }).remoteAddress ?? '?'
    const refuse = (status: string): void => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
      socket.destroy()
    }
    if (this.closing || (req.url ?? '').split('?')[0] !== SYNC_PATH) return refuse('404 Not Found')
    const host = this.hostOk(req)
    if (!host) return refuse('404 Not Found')
    // browsers always send Origin: a page from anywhere else may not open the channel (defence in depth: it can't
    // authenticate anyway)
    const origin = req.headers.origin
    if (origin !== undefined && origin.toLowerCase() !== `http://${host}`) return refuse('403 Forbidden')
    if (this.blocked(ip)) return refuse('429 Too Many Requests')
    const fromIp = [...this.conns].filter((c) => c.ip === ip).length
    if (this.conns.size >= MAX_CONNECTIONS || fromIp >= MAX_CONNECTIONS_PER_IP) return refuse('503 Service Unavailable')
    const ws = acceptWebSocket(req, socket, head, PREAUTH_FRAME_BYTES)
    if (!ws) return
    const conn = new Conn(ws, ip)
    this.conns.add(conn)
    ws.onClose(() => {
      const wasDevice = !!conn.deviceId
      this.conns.delete(conn)
      if (wasDevice) this.opts.onStatus()
    })
    this.handshake(conn)
  }

  private handshake(conn: Conn): void {
    const { ws } = conn
    const timer = setTimeout(() => ws.close(4408, 'handshake timeout'), HELLO_TIMEOUT_MS)
    const reject = (reason: RejectReason, auth = false): void => {
      clearTimeout(timer)
      if (auth) this.authFailure(conn.ip)
      ws.send(JSON.stringify({ t: 'reject', reason }))
      ws.close(4401, reason)
    }
    let hello: HelloFrame | null = null
    let pairing: { id: string; key: Uint8Array } | null = null
    ws.onFrame((raw) => {
      conn.lastSeen = Date.now()
      if (!hello) {
        try {
          hello = parseHello(raw)
        } catch {
          return reject('bad-request', true)
        }
        let secret: Uint8Array
        if (hello.mode === 'device') {
          const key = this.opts.devices.keyOf(hello.id)
          if (!key) return reject('unknown-device', true)
          secret = fromB64u(key)
        } else {
          const p = this.pairings.get(hello.id)
          if (!p || p.expiresAt < Date.now()) return reject('pairing-expired', true)
          pairing = { id: hello.id, key: p.key }
          secret = p.key
        }
        const sn = randomBytes(HANDSHAKE_NONCE_BYTES)
        conn.channel = new SecureChannel(secret, fromB64u(hello.cn), new Uint8Array(sn), hello.mode, hello.id, 'server')
        ws.send(JSON.stringify({ t: 'challenge', sn: toB64u(sn) }))
        return
      }
      let msg: Message
      try {
        if (!conn.deviceId && raw.length > MAX_CALL_BYTES) throw new Error('too large')
        msg = conn.channel!.open(JSON.parse(raw))
      } catch {
        // forged, replayed or garbage: drop the connection (counts against the IP)
        if (!conn.deviceId) return reject('bad-request', true)
        this.authFailure(conn.ip)
        return ws.close(4400, 'bad frame')
      }
      if (!conn.deviceId) {
        clearTimeout(timer)
        const h = hello as HelloFrame
        if (h.mode === 'pair' && msg.type === 'pair' && pairing) {
          // one-time: consume before anything else can use it
          if (!this.pairings.delete(pairing.id)) return reject('pairing-expired')
          const device = this.opts.devices.add(cleanDeviceName(msg.name))
          this.log(`paired ${cleanDeviceName(msg.name)}`)
          conn.send({ type: 'paired', deviceId: device.id, deviceKey: device.key, host: this.opts.macName })
          this.opts.onStatus()
          setTimeout(() => ws.close(1000, 'paired'), 50)
          return
        }
        if (h.mode === 'device' && msg.type === 'auth') {
          conn.deviceId = h.id
          ws.setMaxMessageBytes(MAX_FRAME_BYTES)
          conn.name = this.opts.devices.get(h.id)?.name ?? 'iPad'
          this.opts.devices.touch(h.id)
          conn.scope = this.board ? new BoardScope(this.opts.services, this.board.id) : null
          conn.send({ type: 'welcome', host: this.opts.macName, board: this.board, settings: this.opts.settings() })
          this.log(`${conn.name} connected`)
          this.opts.onStatus()
          return
        }
        return reject('bad-request', true)
      }
      if (raw.length > MAX_CALL_BYTES && !(msg.type === 'call' && msg.method === 'importFileData')) return ws.close(1009, 'too large')
      void this.dispatch(conn, msg)
    })
  }

  private async dispatch(conn: Conn, msg: Message): Promise<void> {
    if (msg.type === 'ping') return conn.send({ type: 'pong' })
    const reqId = Number.isSafeInteger(msg.id) ? (msg.id as number) : -1
    if (msg.type === 'file') {
      if (!conn.allow('file')) return conn.send({ type: 'fileData', id: reqId, ok: false, error: 'Too many requests' })
      const fileId = typeof msg.fileId === 'string' && msg.fileId.length <= 64 ? msg.fileId : ''
      try {
        if (!conn.scope || !fileId || !conn.scope.fileAllowed(fileId)) throw new PolicyError('File is not on the shared whiteboard')
        const f = await this.opts.readFile(fileId)
        if (!f) throw new Error('File not found')
        if (f.bytes.length > MAX_FILE_BYTES) throw new Error('File too large for the iPad')
        conn.send({ type: 'fileData', id: reqId, ok: true, mime: f.mime, data: f.bytes.toString('base64') })
      } catch (e) {
        conn.send({ type: 'fileData', id: reqId, ok: false, error: (e as Error).message })
      }
      return
    }
    if (msg.type !== 'call') return
    const method = msg.method as ApiMethod
    const fail = (error: string): void => conn.send({ type: 'result', id: reqId, ok: false, error })
    if (typeof method !== 'string' || !Array.isArray(msg.args) || msg.args.length > 4) return fail('Invalid call')
    if (!conn.allow(method)) return fail('Too many requests — slow down')
    if (!conn.scope) return fail('No whiteboard is shared right now')
    try {
      const decision = conn.scope.authorize(method, msg.args)
      const data = 'result' in decision ? decision.result : await this.opts.call(method, decision.args).then((d) => (decision.post ? decision.post(d) : d))
      conn.scope.learn(method, data)
      // the Mac's file system layout is none of the iPad's business
      const safe = method === 'importFileData' && data && typeof data === 'object' ? { ...(data as object), path: '' } : data
      conn.send({ type: 'result', id: reqId, ok: true, data: safe ?? null })
      const scopes = 'result' in decision ? null : writeScopes(method)
      if (scopes) this.opts.onWrite(scopes)
    } catch (e) {
      if (!(e instanceof PolicyError)) this.log(`${method} failed: ${(e as Error).message}`)
      fail(e instanceof Error ? e.message : 'Failed')
    }
  }
}
