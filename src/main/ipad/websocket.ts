import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { SyncTransport } from '@shared/sync/protocol'

/**
 * Minimal RFC 6455 server side (text frames, fragmentation, ping/pong, close) — all Sidera for iPad needs, without a
 * dependency. Frames from clients must be masked; binary frames, oversized messages and protocol errors close the
 * connection. Security does not depend on this layer: every payload is end-to-end sealed (shared/sync/crypto.ts).
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** Completes the opening handshake; returns null (socket destroyed) when the request is not a valid upgrade. */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex, head: Buffer, maxMessageBytes: number): WsConnection | null {
  const key = req.headers['sec-websocket-key']
  if (
    req.method !== 'GET' ||
    !/\bwebsocket\b/i.test(req.headers.upgrade ?? '') ||
    req.headers['sec-websocket-version'] !== '13' ||
    typeof key !== 'string' ||
    !/^[A-Za-z0-9+/]{22}==$/.test(key)
  ) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
    socket.destroy()
    return null
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  return new WsConnection(socket, maxMessageBytes, head)
}

export class WsConnection implements SyncTransport {
  private chunks: Buffer[] = []
  private buffered = 0
  private fragments: Buffer[] = []
  private fragmentBytes = 0
  private closed = false
  private frameCbs: ((frame: string) => void)[] = []
  private closeCbs: ((code: number, reason: string) => void)[] = []
  /** text messages that arrived before anyone listened */
  private early: string[] = []

  constructor(
    private socket: Duplex,
    private maxMessageBytes: number,
    head?: Buffer
  ) {
    ;(socket as { setNoDelay?: (v: boolean) => void }).setNoDelay?.(true)
    socket.on('data', (c: Buffer) => this.onData(c))
    socket.on('close', () => this.finish(1006, ''))
    socket.on('error', () => this.finish(1006, ''))
    if (head?.length) this.onData(head)
  }

  /** Changes the message size cap (tight before authentication, wide for an authenticated device). */
  setMaxMessageBytes(n: number): void {
    this.maxMessageBytes = n
  }

  get isOpen(): boolean {
    return !this.closed
  }

  onFrame(cb: (frame: string) => void): void {
    this.frameCbs.push(cb)
    const early = this.early
    this.early = []
    for (const f of early) cb(f)
  }

  onClose(cb: (code: number, reason: string) => void): void {
    this.closeCbs.push(cb)
  }

  send(text: string): void {
    if (this.closed) return
    this.write(0x1, Buffer.from(text, 'utf8'))
  }

  close(code = 1000, reason = ''): void {
    if (this.closed) return
    const r = Buffer.from(reason.slice(0, 100), 'utf8')
    const body = Buffer.alloc(2 + r.length)
    body.writeUInt16BE(code, 0)
    r.copy(body, 2)
    this.write(0x8, body)
    this.socket.end()
    // don't wait forever for the peer's close frame
    setTimeout(() => this.socket.destroy(), 1000).unref?.()
    this.finish(code, reason)
  }

  private finish(code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    this.chunks = []
    this.fragments = []
    for (const cb of this.closeCbs) cb(code, reason)
  }

  private write(opcode: number, payload: Buffer): void {
    const len = payload.length
    const header = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10)
    header[0] = 0x80 | opcode
    if (len < 126) header[1] = len
    else if (len < 65536) {
      header[1] = 126
      header.writeUInt16BE(len, 2)
    } else {
      header[1] = 127
      header.writeBigUInt64BE(BigInt(len), 2)
    }
    this.socket.write(Buffer.concat([header, payload]))
  }

  private onData(chunk: Buffer): void {
    if (this.closed) return
    this.chunks.push(chunk)
    this.buffered += chunk.length
    try {
      while (this.parseFrame());
    } catch (e) {
      this.close((e as { code?: number }).code ?? 1002, 'protocol error')
    }
  }

  /** Copies the first n buffered bytes without consuming them (n is small: frame headers). */
  private peek(n: number): Buffer {
    const out = Buffer.alloc(n)
    let o = 0
    for (const c of this.chunks) {
      const k = Math.min(c.length, n - o)
      c.copy(out, o, 0, k)
      o += k
      if (o === n) break
    }
    return out
  }

  /** Consumes n bytes (one copy, no quadratic re-concatenation for large messages). */
  private take(n: number): Buffer {
    const out = Buffer.allocUnsafe(n)
    let o = 0
    while (o < n) {
      const c = this.chunks[0]
      const k = Math.min(c.length, n - o)
      c.copy(out, o, 0, k)
      o += k
      if (k === c.length) this.chunks.shift()
      else this.chunks[0] = c.subarray(k)
    }
    this.buffered -= n
    return out
  }

  private parseFrame(): boolean {
    if (this.buffered < 2) return false
    const h = this.peek(Math.min(this.buffered, 14))
    const fin = (h[0] & 0x80) !== 0
    if (h[0] & 0x70) throw Object.assign(new Error('rsv'), { code: 1002 })
    const opcode = h[0] & 0x0f
    if (!(h[1] & 0x80)) throw Object.assign(new Error('unmasked'), { code: 1002 })
    let len = h[1] & 0x7f
    let offset = 2
    if (len === 126) {
      if (h.length < 4) return false
      len = h.readUInt16BE(2)
      offset = 4
    } else if (len === 127) {
      if (h.length < 10) return false
      const big = h.readBigUInt64BE(2)
      if (big > BigInt(this.maxMessageBytes)) throw Object.assign(new Error('too big'), { code: 1009 })
      len = Number(big)
      offset = 10
    }
    const control = opcode >= 0x8
    if (control && (len > 125 || !fin)) throw Object.assign(new Error('bad control'), { code: 1002 })
    if (!control && this.fragmentBytes + len > this.maxMessageBytes) throw Object.assign(new Error('too big'), { code: 1009 })
    if (this.buffered < offset + 4 + len) return false
    this.take(offset)
    const mask = this.take(4)
    const payload = this.take(len)
    for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3]

    if (opcode === 0x8) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005
      this.close(code === 1005 ? 1000 : code, '')
      return false
    }
    if (opcode === 0x9) {
      this.write(0xa, payload)
      return true
    }
    if (opcode === 0xa) return true
    if (opcode === 0x2) throw Object.assign(new Error('binary'), { code: 1003 })
    if (opcode !== 0x1 && opcode !== 0x0) throw Object.assign(new Error('opcode'), { code: 1002 })
    if (opcode === 0x0 && !this.fragments.length) throw Object.assign(new Error('continuation'), { code: 1002 })
    if (opcode === 0x1 && this.fragments.length) throw Object.assign(new Error('interleaved'), { code: 1002 })
    this.fragments.push(payload)
    this.fragmentBytes += len
    if (!fin) return true
    const text = (this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments)).toString('utf8')
    this.fragments = []
    this.fragmentBytes = 0
    if (this.frameCbs.length) for (const cb of this.frameCbs) cb(text)
    else this.early.push(text)
    return !this.closed
  }
}
