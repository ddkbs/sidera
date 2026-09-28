import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { DrawState } from '@shared/draw'
import {
  DRAW_KEY_BYTES,
  DRAW_MAX_BODY_BYTES,
  DRAW_SESSION_ID_BYTES,
  open,
  seal,
  toB64u,
  validateSubmission,
  type DrawSubmission,
  type Message
} from '@shared/drawProtocol'

/**
 * One Sidera Draw session: a tiny HTTP server on a private LAN address that serves the companion page and accepts
 * end-to-end encrypted messages from exactly one paired device. It lives only while the Mac is waiting for a drawing
 * and closes itself (dropping every socket) on handoff, cancel, timeouts or repeated authentication failures.
 * Deliberately separate from the MCP server. No Electron imports, so it can be tested in plain Node.
 */

export interface DrawTimeouts {
  /** close if nobody pairs within this time */
  pairMs: number
  /** after pairing: report "disconnected" when no heartbeat for this long */
  staleMs: number
  /** after pairing: close when no heartbeat for this long */
  idleMs: number
  /** hard cap for the whole session */
  maxMs: number
  /** how often the watchdog runs */
  tickMs: number
}

const DEFAULT_TIMEOUTS: DrawTimeouts = { pairMs: 3 * 60_000, staleMs: 25_000, idleMs: 60_000, maxMs: 30 * 60_000, tickMs: 2_000 }
export const MAX_AUTH_FAILURES = 5

export interface DrawServerOptions {
  /** private LAN IPv4 to bind to */
  address: string
  /** the self-contained companion page */
  html: string
  /** Mac name shown on the device once paired */
  host: string
  onStatus: (state: DrawState, reason?: string) => void
  onReceived: (drawing: DrawSubmission) => void
  timeouts?: Partial<DrawTimeouts>
  log?: (msg: string) => void
}

/** Strict CSP for the companion page: only its own inline script/style (by hash) may run. */
export function companionHeaders(html: string): Record<string, string> {
  const hashes = (tag: 'script' | 'style'): string =>
    [...html.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
      .map((m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)
      .join(' ') || "'none'"
  const csp = [
    "default-src 'none'",
    `script-src ${hashes('script')}`,
    `style-src ${hashes('style')}`,
    'img-src data: blob:',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  }
}

const API_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin'
}

const sameString = (a: string, b: string): boolean => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(String(status))
  }
}

export class DrawServer {
  readonly sessionId = toB64u(randomBytes(DRAW_SESSION_ID_BYTES))
  readonly key: Uint8Array = new Uint8Array(randomBytes(DRAW_KEY_BYTES))
  port = 0
  state: DrawState = 'waiting'

  private server: Server
  private headers: Record<string, string>
  private timeouts: DrawTimeouts
  private token: string | null = null
  private lastC2s = 0
  private s2c = 0
  private failures = 0
  private lastSeen = 0
  private startedAt = Date.now()
  private watchdog: NodeJS.Timeout | null = null
  private hardCap: NodeJS.Timeout | null = null
  private closing: Promise<void> | null = null
  /** set by a message that ends the session: closes once its reply has been flushed */
  private closeAfterReply: string | null = null
  private log: (msg: string) => void

  private constructor(private opts: DrawServerOptions) {
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...opts.timeouts }
    this.headers = companionHeaders(opts.html)
    this.log = opts.log ?? ((m) => console.log(`[sidera-draw] ${m}`))
    this.server = createServer({ requestTimeout: 30_000, headersTimeout: 10_000, keepAliveTimeout: 5_000, maxHeaderSize: 8192 }, (req, res) =>
      void this.handle(req, res).catch((e) => this.fail(res, e))
    )
    this.server.on('clientError', (_e, socket) => socket.destroy())
  }

  /** Binds to `address` on a random free port. Rejects if that is impossible (e.g. the address vanished). */
  static async start(opts: DrawServerOptions): Promise<DrawServer> {
    const s = new DrawServer(opts)
    await new Promise<void>((resolve, reject) => {
      s.server.once('error', reject)
      s.server.listen(0, opts.address, () => {
        s.server.off('error', reject)
        resolve()
      })
    })
    s.port = (s.server.address() as { port: number }).port
    s.startedAt = Date.now()
    s.watchdog = setInterval(() => s.tick(), s.timeouts.tickMs)
    s.hardCap = setTimeout(() => void s.close('time-limit'), s.timeouts.maxMs)
    s.log(`session open on ${opts.address}:${s.port}`)
    s.setState('waiting')
    return s
  }

  /** QR target: the key rides in the fragment, which browsers never send to the server. */
  get url(): string {
    return `http://${this.opts.address}:${this.port}/d/${this.sessionId}#${toB64u(this.key)}`
  }

  get closed(): boolean {
    return this.closing !== null
  }

  /** Stops listening and destroys every open socket. Idempotent; resolves once the port is released. */
  close(reason: string): Promise<void> {
    if (this.closing) return this.closing
    if (this.watchdog) clearInterval(this.watchdog)
    if (this.hardCap) clearTimeout(this.hardCap)
    this.watchdog = this.hardCap = null
    this.closing = new Promise<void>((r) => this.server.close(() => r()))
    this.server.closeAllConnections()
    this.log(`session closed (${reason})`)
    this.setState('closed', reason)
    return this.closing
  }

  private setState(state: DrawState, reason?: string): void {
    if (this.state === 'closed') return
    this.state = state
    this.opts.onStatus(state, reason)
  }

  private tick(): void {
    const now = Date.now()
    if (!this.token) {
      if (now - this.startedAt > this.timeouts.pairMs) void this.close('pairing-timeout')
      return
    }
    const silent = now - this.lastSeen
    if (silent > this.timeouts.idleMs) void this.close('heartbeat-timeout')
    else if (silent > this.timeouts.staleMs && this.state === 'connected') this.setState('disconnected')
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.closed) throw new HttpError(404)
    // DNS-rebinding guard: only requests addressed to our exact LAN socket
    if (req.headers.host !== `${this.opts.address}:${this.port}`) throw new HttpError(404)
    const m = /^\/d\/([A-Za-z0-9_-]{1,64})(\/api)?$/.exec(req.url ?? '')
    if (!m || !sameString(m[1], this.sessionId)) throw new HttpError(404)
    if (!m[2]) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405)
      res.writeHead(200, this.headers)
      res.end(req.method === 'HEAD' ? undefined : this.opts.html)
      return
    }
    if (req.method !== 'POST') throw new HttpError(405)
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415)
    const body = await readBody(req, DRAW_MAX_BODY_BYTES)
    let msg: Message
    try {
      msg = open(this.key, this.sessionId, 'c2s', JSON.parse(body))
      if (msg.seq <= this.lastC2s) throw new Error('replayed')
    } catch {
      this.authFailure()
      throw new HttpError(400)
    }
    this.reply(res, msg, this.dispatch(msg))
  }

  /** Handles an authenticated message; returns the reply payload. Advances the sequence only for accepted messages. */
  private dispatch(msg: Message): Record<string, unknown> {
    const accept = (): void => {
      this.lastC2s = msg.seq
      this.lastSeen = Date.now()
    }
    if (msg.type === 'hello') {
      if (!this.token) {
        this.token = toB64u(randomBytes(16))
        accept()
        this.log('device paired')
        this.setState('connected')
        return { type: 'ok', token: this.token, host: this.opts.host }
      }
      if (typeof msg.token === 'string' && sameString(msg.token, this.token)) {
        accept()
        this.setState('connected')
        return { type: 'ok', token: this.token, host: this.opts.host }
      }
      return { type: 'error', error: 'already-paired' }
    }
    if (!this.token || typeof msg.token !== 'string' || !sameString(msg.token, this.token)) return { type: 'error', error: 'not-paired' }
    accept()
    if (this.state === 'disconnected') this.setState('connected')
    if (msg.type === 'ping') return { type: 'ok' }
    if (msg.type === 'bye') {
      this.closeAfterReply = 'device-left'
      return { type: 'ok' }
    }
    if (msg.type === 'submit') {
      let drawing: DrawSubmission
      try {
        drawing = validateSubmission(msg.drawing)
      } catch (e) {
        return { type: 'error', error: 'invalid-drawing', message: (e as Error).message }
      }
      this.log(`drawing received (${drawing.strokes.length} strokes)`)
      this.opts.onReceived(drawing)
      this.setState('received')
      this.closeAfterReply = 'received'
      return { type: 'ok', done: true }
    }
    return { type: 'error', error: 'unknown-type' }
  }

  private reply(res: ServerResponse, req: Message, payload: Record<string, unknown>): void {
    const env = seal(this.key, this.sessionId, 's2c', { ...payload, type: String(payload.type), seq: ++this.s2c, re: req.seq })
    const closeReason = this.closeAfterReply
    if (closeReason) res.once('finish', () => void this.close(closeReason))
    res.writeHead(200, { ...API_HEADERS, ...(closeReason ? { Connection: 'close' } : {}) })
    res.end(JSON.stringify(env))
  }

  private authFailure(): void {
    this.failures++
    this.log(`rejected message (${this.failures}/${MAX_AUTH_FAILURES})`)
    if (this.failures >= MAX_AUTH_FAILURES) setImmediate(() => void this.close('auth-failures'))
  }

  private fail(res: ServerResponse, e: unknown): void {
    const status = e instanceof HttpError ? e.status : 500
    if (res.headersSent) return void res.destroy()
    res.writeHead(status, { 'Content-Length': '0', 'Cache-Control': 'no-store', Connection: 'close' })
    res.end()
  }
}

function readBody(req: IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'])
    if (declared > max) {
      req.destroy()
      return reject(new HttpError(413))
    }
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > max) {
        req.destroy()
        reject(new HttpError(413))
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
