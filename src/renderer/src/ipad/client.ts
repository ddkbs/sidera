import type { ApiMethod, DbChangeScope } from '@shared/api'
import { t } from '@/lib/i18n'
import { HANDSHAKE_NONCE_BYTES, SecureChannel, fromB64u, randomBytes, toB64u, type ChannelMode, type Message } from '@shared/sync/crypto'
import {
  HEARTBEAT_MS,
  SYNC_PATH,
  type BoardRef,
  type DeviceCredential,
  type HelloFrame,
  type MirroredSettings,
  type RejectReason,
  type SyncTransport
} from '@shared/sync/protocol'

/** Browser WebSocket as a SyncTransport. A cloud relay transport would implement the same four methods. */
export function webSocketTransport(url: string): SyncTransport & { opened: Promise<void> } {
  const ws = new WebSocket(url)
  const frameCbs: ((f: string) => void)[] = []
  const closeCbs: ((code: number, reason: string) => void)[] = []
  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('connection failed'))
  })
  ws.onmessage = (e) => typeof e.data === 'string' && frameCbs.forEach((cb) => cb(e.data))
  ws.onclose = (e) => closeCbs.forEach((cb) => cb(e.code, e.reason))
  return {
    opened,
    send: (f) => ws.readyState === WebSocket.OPEN && ws.send(f),
    close: (code, reason) => ws.close(code ?? 1000, reason),
    onFrame: (cb) => void frameCbs.push(cb),
    onClose: (cb) => void closeCbs.push(cb)
  }
}

export type ConnectionState = 'connecting' | 'connected' | 'offline' | 'rejected'

interface Session {
  transport: SyncTransport
  channel: SecureChannel
}

/** Opens a transport, runs the cleartext handshake and the first sealed message; resolves with the first reply. */
async function handshake(
  url: string,
  mode: ChannelMode,
  id: string,
  secret: Uint8Array,
  first: { type: string; [k: string]: unknown },
  onMessage: (m: Message) => void,
  onClose: (code: number, reason: string) => void
): Promise<{ session: Session; reply: Message }> {
  const t = webSocketTransport(url)
  await t.opened
  const cn = randomBytes(HANDSHAKE_NONCE_BYTES)
  return new Promise((resolve, reject) => {
    let channel: SecureChannel | null = null
    let done = false
    const timer = setTimeout(() => fail(new Error('timeout')), 10_000)
    const fail = (e: Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      t.close(1000)
      reject(e)
    }
    t.onClose((code, reason) => {
      if (!done) fail(new RejectError((reason as RejectReason) || 'bad-request'))
      else onClose(code, reason)
    })
    t.onFrame((raw) => {
      try {
        if (!channel) {
          const f = JSON.parse(raw) as { t: string; sn?: string; reason?: RejectReason }
          if (f.t === 'reject') return fail(new RejectError(f.reason ?? 'bad-request'))
          if (f.t !== 'challenge' || typeof f.sn !== 'string') return fail(new Error('bad challenge'))
          channel = new SecureChannel(secret, cn, fromB64u(f.sn), mode, id, 'client')
          t.send(JSON.stringify(channel.seal(first)))
          return
        }
        const msg = channel.open(JSON.parse(raw))
        if (!done) {
          done = true
          clearTimeout(timer)
          resolve({ session: { transport: t, channel }, reply: msg })
        } else onMessage(msg)
      } catch (e) {
        // a frame we can't authenticate: never trust the connection again
        if (!done) fail(e as Error)
        else t.close(4400, 'bad frame')
      }
    })
    const hello: HelloFrame = { t: 'hello', v: 1, mode, id, cn: toB64u(cn) }
    t.send(JSON.stringify(hello))
  })
}

export class RejectError extends Error {
  constructor(readonly reason: RejectReason) {
    super(reason)
  }
}

export const syncUrl = (origin = location.origin): string => origin.replace(/^http/, 'ws') + SYNC_PATH

/** One-time pairing with the key from the QR code; returns the long-lived device credential. */
export async function pair(pairingId: string, key: Uint8Array, name: string): Promise<{ credential: DeviceCredential; host: string }> {
  const { session, reply } = await handshake(syncUrl(), 'pair', pairingId, key, { type: 'pair', name }, () => {}, () => {})
  session.transport.close(1000)
  if (reply.type !== 'paired' || typeof reply.deviceId !== 'string' || typeof reply.deviceKey !== 'string') throw new Error('Pairing failed')
  return { credential: { deviceId: reply.deviceId, deviceKey: reply.deviceKey }, host: String(reply.host ?? 'Mac') }
}

/** The whiteboard open on this iPad, reopened after a reconnect or app restart. */
const BOARD_KEY = 'sidera.ipad.board'
const storedBoard = (): string | null => {
  try {
    return localStorage.getItem(BOARD_KEY)
  } catch {
    return null
  }
}

export interface ClientEvents {
  state: (s: ConnectionState, reason?: RejectReason) => void
  board: (b: BoardRef | null) => void
  changed: (scopes: DbChangeScope[]) => void
  settings: (s: MirroredSettings) => void
}

/**
 * The iPad's live connection: authenticates with the device credential, reconnects with backoff (and right away when
 * the app comes back to the foreground), keeps a heartbeat, and multiplexes API calls / file reads over the channel.
 */
export class SyncClient {
  state: ConnectionState = 'connecting'
  host = ''
  board: BoardRef | null = null
  /** the board the user picked (kept while offline, so a reconnect reopens it) */
  private wanted: string | null = storedBoard()
  settings: MirroredSettings | null = null
  private session: Session | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private listeners: { [K in keyof ClientEvents]: Set<ClientEvents[K]> } = { state: new Set(), board: new Set(), changed: new Set(), settings: new Set() }
  private attempt = 0
  private retry: ReturnType<typeof setTimeout> | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private lastFrame = 0
  private waiters: (() => void)[] = []
  private stopped = false
  private connecting = false

  constructor(
    private credential: DeviceCredential | null,
    private name: string
  ) {
    const wake = (): void => {
      if (document.visibilityState === 'visible' && this.state !== 'connected' && this.state !== 'rejected') this.connectNow()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('pageshow', wake)
  }

  on<K extends keyof ClientEvents>(event: K, cb: ClientEvents[K]): () => void {
    this.listeners[event].add(cb)
    return () => void this.listeners[event].delete(cb)
  }

  private emit<K extends keyof ClientEvents>(event: K, ...args: Parameters<ClientEvents[K]>): void {
    for (const cb of this.listeners[event]) (cb as (...a: unknown[]) => void)(...args)
  }

  private setState(s: ConnectionState, reason?: RejectReason): void {
    this.state = s
    this.emit('state', s, reason)
    if (s === 'connected') {
      const w = this.waiters
      this.waiters = []
      w.forEach((f) => f())
    }
  }

  /** (Re)connects with this credential (e.g. right after pairing, or the URL fallback after a rejection). */
  start(credential: DeviceCredential | null = this.credential): void {
    if (credential !== this.credential) this.session?.transport.close(1000)
    this.credential = credential
    this.stopped = false
    this.attempt = 0
    if (credential) this.connectNow()
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.retry)
    this.session?.transport.close(1000)
  }

  private connectNow(): void {
    clearTimeout(this.retry)
    if (this.stopped || this.session || this.connecting || !this.credential) return
    void this.connect()
  }

  private async connect(): Promise<void> {
    if (this.state !== 'connecting') this.setState('connecting')
    this.connecting = true
    const cred = this.credential!
    try {
      const { session, reply } = await handshake(
        syncUrl(),
        'device',
        cred.deviceId,
        fromB64u(cred.deviceKey),
        { type: 'auth', name: this.name },
        (m) => this.onMessage(m),
        () => this.onDisconnect()
      )
      if (reply.type !== 'welcome') throw new Error('unexpected reply')
      this.session = session
      this.attempt = 0
      this.lastFrame = Date.now()
      this.host = String(reply.host ?? '')
      this.settings = (reply.settings as MirroredSettings) ?? null
      if (this.settings) this.emit('settings', this.settings)
      this.board = null
      if (this.wanted) this.send({ type: 'open', boardId: this.wanted })
      else this.emit('board', null)
      this.setState('connected')
      clearInterval(this.heartbeat)
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastFrame > HEARTBEAT_MS * 2.5) return void this.session?.transport.close(4008, 'stale')
        this.send({ type: 'ping' })
      }, HEARTBEAT_MS)
      // anything may have changed while we were away
      this.emit('changed', ['all'])
    } catch (e) {
      if (e instanceof RejectError && (e.reason === 'unknown-device' || e.reason === 'bad-request')) {
        this.setState('rejected', e.reason)
        return
      }
      this.scheduleRetry()
    } finally {
      this.connecting = false
    }
  }

  private scheduleRetry(): void {
    if (this.stopped) return
    this.setState('offline')
    const delay = Math.min(10_000, 500 * 2 ** this.attempt++) * (0.75 + Math.random() * 0.5)
    this.retry = setTimeout(() => this.connectNow(), delay)
  }

  private onDisconnect(): void {
    clearInterval(this.heartbeat)
    this.session = null
    for (const p of this.pending.values()) p.reject(new Error(t('ipadApp.lost')))
    this.pending.clear()
    this.scheduleRetry()
  }

  private send(msg: { type: string; [k: string]: unknown }): void {
    const s = this.session
    if (s) s.transport.send(JSON.stringify(s.channel.seal(msg)))
  }

  private onMessage(m: Message): void {
    this.lastFrame = Date.now()
    if (m.type === 'result' || m.type === 'fileData') {
      const p = this.pending.get(m.id as number)
      if (!p) return
      this.pending.delete(m.id as number)
      if (m.ok) p.resolve(m.type === 'result' ? m.data : { mime: m.mime, data: m.data })
      else p.reject(new Error(String(m.error ?? 'Failed')))
    } else if (m.type === 'changed' && Array.isArray(m.scopes)) this.emit('changed', m.scopes as DbChangeScope[])
    else if (m.type === 'board') {
      this.board = (m.board as BoardRef | null) ?? null
      // gone on the Mac (deleted): back to the list for good
      if (!this.board) this.remember(null)
      this.emit('board', this.board)
    } else if (m.type === 'settings') {
      this.settings = m.settings as MirroredSettings
      this.emit('settings', this.settings)
    }
  }

  /** Waits (up to 15 s) for a live connection, so a call made during a short reconnect still goes through. */
  private ready(): Promise<void> {
    if (this.state === 'connected' && this.session) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(t('ipadApp.notConnected'))), 15_000)
      this.waiters.push(() => (clearTimeout(timer), resolve()))
    })
  }

  private async request(msg: { type: 'call'; method: ApiMethod; args: unknown[] } | { type: 'file'; fileId: string }): Promise<unknown> {
    await this.ready()
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.send({ ...msg, id })
    })
  }

  /** Opens a whiteboard (null = back to the board list); `board` fires once the Mac has switched. */
  open(boardId: string | null): void {
    this.remember(boardId)
    if (!boardId) {
      this.board = null
      this.emit('board', null)
    }
    if (this.state === 'connected') this.send({ type: 'open', boardId })
  }

  private remember(boardId: string | null): void {
    this.wanted = boardId
    try {
      if (boardId) localStorage.setItem(BOARD_KEY, boardId)
      else localStorage.removeItem(BOARD_KEY)
    } catch {
      /* private mode */
    }
  }

  call(method: ApiMethod, args: unknown[]): Promise<unknown> {
    return this.request({ type: 'call', method, args })
  }

  file(fileId: string): Promise<{ mime: string; data: string }> {
    return this.request({ type: 'file', fileId }) as Promise<{ mime: string; data: string }>
  }
}
