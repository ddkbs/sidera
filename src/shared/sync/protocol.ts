/**
 * Sidera for iPad — wire protocol, shared by the Mac (main process) and the iPad web app. Pure.
 *
 * Layers (bottom → top):
 *  1. `SyncTransport`: anything that moves text frames both ways. Today a WebSocket to the Mac on the LAN
 *     (`src/main/ipad/server.ts` ↔ `renderer/src/ipad/client.ts`). The protocol never relies on the transport for
 *     security, so the LAN server can later be swapped for a cloud relay that only forwards frames between a device
 *     and the Mac by device id: it sees the cleartext handshake (ids + random nonces) and ciphertext, nothing else.
 *  2. Handshake (cleartext): client `hello {mode, id, cn}` → server `challenge {sn}` (or `reject {reason}`).
 *  3. `SecureChannel` (crypto.ts): every further frame is sealed under per-connection keys derived from the device key
 *     (mode `device`) or the one-time pairing key from the QR code (mode `pair`). The first sealed client message
 *     (`auth` / `pair`) proves possession of the secret; nothing is answered before it.
 *  4. Messages: `open` picks the whiteboard the device works on (answered with `board`), RPC `call` → `result` onto
 *     the whitelisted CanvasApi subset, `file` → `fileData`, and pushes `board` / `changed` / `settings` from the Mac.
 */
import type { ApiMethod, DbChangeScope } from '../api'
import type { Lang } from '../i18n'
import type { AppSettings } from '../settings'
import { HANDSHAKE_NONCE_BYTES, KEY_BYTES, fixedB64u, toB64u, type ChannelMode } from './crypto'

/** Default LAN port (stable, so the iPad's home-screen app keeps its origin = its stored credential). */
export const IPAD_DEFAULT_PORT = 47821
/** Path of the WebSocket endpoint. */
export const SYNC_PATH = '/sync'
export const DEVICE_ID_BYTES = 16
export const PAIRING_ID_BYTES = 16
/** one-time pairing tokens expire after this */
export const PAIRING_TTL_MS = 5 * 60_000
export const HEARTBEAT_MS = 10_000
/** max frame (bytes of text) either side accepts: an image upload + base64 + envelope overhead */
export const MAX_FRAME_BYTES = 32 * 1024 * 1024
/** max frame for everything except uploads */
export const MAX_CALL_BYTES = 4 * 1024 * 1024
/** decoded size of one image uploaded from the iPad */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
export const UPLOAD_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

// ─── transport ──────────────────────────────────────────────────────────────────────────────────────

/** Relay-agnostic frame pipe. Implementations: browser WebSocket (iPad), RFC 6455 server socket (Mac). */
export interface SyncTransport {
  send(frame: string): void
  close(code?: number, reason?: string): void
  onFrame(cb: (frame: string) => void): void
  onClose(cb: (code: number, reason: string) => void): void
}

// ─── handshake (cleartext) ──────────────────────────────────────────────────────────────────────────

export interface HelloFrame {
  t: 'hello'
  v: 1
  mode: ChannelMode
  /** device id (mode device) or pairing id (mode pair) */
  id: string
  /** client nonce */
  cn: string
}
export interface ChallengeFrame {
  t: 'challenge'
  sn: string
}
export type RejectReason = 'unknown-device' | 'pairing-expired' | 'busy' | 'bad-request' | 'rate-limited'
export interface RejectFrame {
  t: 'reject'
  reason: RejectReason
}

/** Strict parse of the first client frame. */
export function parseHello(raw: string): HelloFrame {
  if (raw.length > 512) throw new Error('hello too large')
  const f = JSON.parse(raw) as Record<string, unknown>
  if (!f || f.t !== 'hello' || f.v !== 1 || (f.mode !== 'device' && f.mode !== 'pair')) throw new Error('bad hello')
  fixedB64u(f.id, f.mode === 'device' ? DEVICE_ID_BYTES : PAIRING_ID_BYTES)
  fixedB64u(f.cn, HANDSHAKE_NONCE_BYTES)
  return { t: 'hello', v: 1, mode: f.mode, id: f.id as string, cn: f.cn as string }
}

// ─── messages (inside the channel) ──────────────────────────────────────────────────────────────────

export interface BoardRef {
  id: string
  name: string
}

/** Appearance-related settings the iPad mirrors (never AI / MCP configuration), plus the Mac's resolved UI language. */
export type MirroredSettings = Pick<AppSettings, 'theme' | 'font' | 'fontSize' | 'editor' | 'canvas' | 'language'>
export const mirroredSettings = (s: AppSettings, language: Lang | null = s.language): MirroredSettings => ({
  theme: s.theme,
  font: s.font,
  fontSize: s.fontSize,
  editor: s.editor,
  canvas: s.canvas,
  language
})

export type ClientMessage =
  | { type: 'auth'; name: string }
  | { type: 'pair'; name: string }
  | { type: 'call'; id: number; method: ApiMethod; args: unknown[] }
  /** open a whiteboard (null = back to the board list); the Mac answers with `board` */
  | { type: 'open'; boardId: string | null }
  | { type: 'file'; id: number; fileId: string }
  | { type: 'ping' }

export type ServerMessage =
  | { type: 'welcome'; host: string; board: BoardRef | null; settings: MirroredSettings }
  | { type: 'paired'; deviceId: string; deviceKey: string; host: string }
  | { type: 'result'; id: number; ok: true; data: unknown }
  | { type: 'result'; id: number; ok: false; error: string }
  | { type: 'fileData'; id: number; ok: true; mime: string; data: string }
  | { type: 'fileData'; id: number; ok: false; error: string }
  | { type: 'board'; board: BoardRef | null }
  | { type: 'changed'; scopes: DbChangeScope[] }
  | { type: 'settings'; settings: MirroredSettings }
  | { type: 'pong' }

/** Device name shown in Settings: printable, trimmed, short. */
export const cleanDeviceName = (name: unknown): string =>
  (typeof name === 'string' ? name : '').replace(/[^\p{L}\p{N} '’._()-]/gu, '').trim().slice(0, 40) || 'iPad'

// ─── pairing link ───────────────────────────────────────────────────────────────────────────────────

/**
 * QR target: `http://<host>:<port>/#pair=<pairingId>.<pairingKey>`. The fragment is never sent to the server by the
 * browser, so the pairing key only travels through the camera.
 */
export const pairingUrl = (origin: string, pairingId: string, key: Uint8Array): string => `${origin}/#pair=${pairingId}.${toB64u(key)}`

export function parsePairingFragment(hash: string): { id: string; key: Uint8Array } | null {
  const m = /^#pair=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(hash)
  if (!m) return null
  try {
    fixedB64u(m[1], PAIRING_ID_BYTES)
    return { id: m[1], key: fixedB64u(m[2], KEY_BYTES) }
  } catch {
    return null
  }
}

/** Long-lived device credential as the iPad stores it. */
export interface DeviceCredential {
  deviceId: string
  deviceKey: string
}

export function parseCredential(v: unknown): DeviceCredential | null {
  if (!v || typeof v !== 'object') return null
  const { deviceId, deviceKey } = v as Record<string, unknown>
  try {
    fixedB64u(deviceId, DEVICE_ID_BYTES)
    fixedB64u(deviceKey, KEY_BYTES)
    return { deviceId: deviceId as string, deviceKey: deviceKey as string }
  } catch {
    return null
  }
}

// ─── uploads ────────────────────────────────────────────────────────────────────────────────────────

/** Decoded size of a standard base64 string (assumes it passed the charset / length check). */
export const base64Bytes = (b64: string): number => (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)

const STD_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Decodes the first `n` bytes of a standard base64 string (enough to sniff a file signature). */
function base64Head(b64: string, n: number): number[] {
  const out: number[] = []
  let acc = 0
  let bits = 0
  for (let i = 0; i < b64.length && out.length < n; i++) {
    const v = STD_B64.indexOf(b64[i])
    if (v < 0) break
    acc = ((acc << 6) | v) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((acc >> bits) & 255)
    }
  }
  return out
}

/** Does the file signature (magic bytes) match the declared mime type? */
export function imageMagicMatches(mime: string, b64: string): boolean {
  const h = base64Head(b64, 12)
  const is = (offset: number, bytes: number[]): boolean => bytes.every((b, i) => h[offset + i] === b)
  if (mime === 'image/png') return is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (mime === 'image/jpeg') return is(0, [0xff, 0xd8, 0xff])
  if (mime === 'image/gif') return is(0, [0x47, 0x49, 0x46, 0x38])
  // RIFF....WEBP
  if (mime === 'image/webp') return is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])
  return false
}

/** Validates an image upload from the iPad (`importFileData`); returns a clean copy or throws. */
export function validateUpload(input: unknown): { name: string; mime: (typeof UPLOAD_MIMES)[number]; dataBase64: string } {
  if (!input || typeof input !== 'object') throw new Error('Invalid upload')
  const { name, mime, dataBase64: data } = input as Record<string, unknown>
  if (typeof mime !== 'string' || !(UPLOAD_MIMES as readonly string[]).includes(mime)) throw new Error('Only PNG, JPEG, WebP and GIF images can be added from the iPad')
  // cheap length check first, so an oversized string never reaches the regex
  if (typeof data !== 'string' || data.length < 8 || data.length % 4 !== 0 || data.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4) throw new Error('Image too large')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Invalid image data')
  if (base64Bytes(data) > MAX_UPLOAD_BYTES) throw new Error('Image too large')
  if (!imageMagicMatches(mime, data)) throw new Error('Image content does not match its type')
  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[mime]
  const base = (typeof name === 'string' ? name : '').replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60) || 'iPad image'
  return { name: base + ext, mime: mime as (typeof UPLOAD_MIMES)[number], dataBase64: data }
}

// ─── change scopes ──────────────────────────────────────────────────────────────────────────────────

const READ = /^(list|get|search|fetch)/
const SCOPES: Partial<Record<ApiMethod, DbChangeScope[]>> = {
  addObject: ['whiteboards'],
  updateObjects: ['whiteboards'],
  removeObjects: ['whiteboards'],
  restoreObjects: ['whiteboards'],
  addConnection: ['whiteboards'],
  updateConnection: ['whiteboards'],
  removeConnections: ['whiteboards'],
  chartFromTable: ['whiteboards'],
  organizeBoard: ['whiteboards'],
  updateWhiteboard: ['whiteboards'],
  updateWhiteboardProperties: ['whiteboards'],
  createCard: ['cards'],
  updateCard: ['cards'],
  deleteCard: ['cards'],
  restoreCard: ['cards'],
  addTextBlock: ['cards', 'whiteboards'],
  setTaskChecked: ['cards'],
  importFiles: ['files'],
  importFileData: ['files'],
  openFile: [],
  exportMarkdown: [],
  importMarkdown: ['all'],
  clipUrl: ['cards']
}

/** Which caches a successful call of `method` invalidates elsewhere (null = read-only). */
export function writeScopes(method: ApiMethod): DbChangeScope[] | null {
  const s = SCOPES[method]
  if (s) return s.length ? s : null
  return READ.test(method) ? null : ['all']
}
