/**
 * Sidera Draw wire protocol — shared by the Mac (main process) and the iPad companion page.
 * Pure: no Node/Electron/DOM-only APIs (only `crypto.getRandomValues`, which also exists on plain-HTTP pages),
 * so it can be bundled into the companion and unit-tested in Node.
 *
 * Transport is plain HTTP on the LAN, so every request/response body is an XChaCha20-Poly1305 envelope under a
 * 256-bit session key that travels only in the QR code's URL fragment (never sent to the server by the browser).
 * The AAD binds each message to its session and direction; `seq` must strictly increase per direction (replay).
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToUtf8, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'

export const DRAW_PROTOCOL_VERSION = 1
export const DRAW_KEY_BYTES = 32
export const DRAW_SESSION_ID_BYTES = 16
export const DRAW_NONCE_BYTES = 24
/** request body cap (bytes), enforced by the server before decrypting */
export const DRAW_MAX_BODY_BYTES = 15 * 1024 * 1024
export const DRAW_HEARTBEAT_MS = 10_000

export const DRAW_LIMITS = {
  maxStrokes: 5000,
  maxPointsPerStroke: 20_000,
  maxTotalPoints: 400_000,
  maxCoord: 100_000,
  maxCanvas: 20_000,
  maxWidth: 200
} as const

export type Direction = 'c2s' | 's2c'

// ─── base64url (no Buffer / atob: runs everywhere) ──────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]))

export function toB64u(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64[n >> 18] + B64[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]
  }
  return out
}

export function fromB64u(s: string): Uint8Array {
  if (typeof s !== 'string' || s.length % 4 === 1) throw new Error('bad base64url')
  const out = new Uint8Array(Math.floor((s.length * 3) / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (const c of s) {
    const v = B64_INDEX.get(c)
    if (v === undefined) throw new Error('bad base64url')
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 255
    }
  }
  // non-canonical trailing bits would make two encodings decode to the same bytes
  if (acc & ((1 << bits) - 1)) throw new Error('bad base64url')
  return out.subarray(0, o)
}

export const randomB64u = (bytes: number): string => toB64u(randomBytes(bytes))

// ─── envelopes ──────────────────────────────────────────────────────────────────────────────────────

export interface Envelope {
  v: 1
  n: string
  c: string
}

/** Every decrypted message carries a type and a per-direction strictly increasing sequence number. */
export interface Message {
  type: string
  seq: number
  [k: string]: unknown
}

const aad = (sessionId: string, dir: Direction): Uint8Array => utf8ToBytes(`sidera-draw/v${DRAW_PROTOCOL_VERSION}|${sessionId}|${dir}`)

export function seal(key: Uint8Array, sessionId: string, dir: Direction, msg: Message): Envelope {
  const nonce = randomBytes(DRAW_NONCE_BYTES)
  const c = xchacha20poly1305(key, nonce, aad(sessionId, dir)).encrypt(utf8ToBytes(JSON.stringify(msg)))
  return { v: 1, n: toB64u(nonce), c: toB64u(c) }
}

/** Decrypts and authenticates an envelope; throws on anything malformed, forged or bound to another session/direction. */
export function open(key: Uint8Array, sessionId: string, dir: Direction, env: unknown): Message {
  if (!env || typeof env !== 'object') throw new Error('bad envelope')
  const { v, n, c } = env as Record<string, unknown>
  if (v !== 1 || typeof n !== 'string' || typeof c !== 'string') throw new Error('bad envelope')
  const nonce = fromB64u(n)
  if (nonce.length !== DRAW_NONCE_BYTES) throw new Error('bad nonce')
  const plain = xchacha20poly1305(key, nonce, aad(sessionId, dir)).decrypt(fromB64u(c))
  const msg = JSON.parse(bytesToUtf8(plain)) as Message
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || !Number.isSafeInteger(msg.seq) || msg.seq < 1) throw new Error('bad message')
  return msg
}

// ─── stroke look ────────────────────────────────────────────────────────────────────────────────────

/**
 * Pressure → width factor of perfect-freehand (Excalidraw's freedraw renderer: thinning 0.6, easeOutSine),
 * normalised so pressure 0.5 → 1. The companion draws with it, so strokes look the same once converted.
 */
export const pressureFactor = (p: number): number => Math.sin((Math.PI / 2) * (0.2 + 0.6 * p)) / Math.SQRT1_2

/** Excalidraw freedraw diameter at pressure 0.5 is `strokeWidth × 4.25 × 2 × sin(π/4)`: divide a nominal width by this. */
export const FREEDRAW_DIAMETER_PER_STROKE_WIDTH = 4.25 * 2 * Math.SQRT1_2

// ─── drawing payload ────────────────────────────────────────────────────────────────────────────────

export type DrawTool = 'pen' | 'highlighter'

/** One stroke in companion-canvas coordinates (CSS px). `width` is the nominal diameter at pressure 0.5. */
export interface DrawStroke {
  tool: DrawTool
  color: string
  width: number
  /** 0–1 */
  opacity: number
  /** [x, y, pressure 0–1] */
  points: [number, number, number][]
  /** snapped to a straight line ("hold to straighten"): exactly two points */
  straight?: boolean
  /** true when the pen reported real pressure (Apple Pencil); false = constant/simulated */
  pressure?: boolean
}

export interface DrawSubmission {
  /** visible canvas size on the device (CSS px), for context only */
  width: number
  height: number
  strokes: DrawStroke[]
}

const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** Strict shape/range check of a decrypted `submit` payload. Returns a clean copy (unknown keys dropped) or throws. */
export function validateSubmission(input: unknown): DrawSubmission {
  const fail = (why: string): never => {
    throw new Error(`Invalid drawing: ${why}`)
  }
  if (!input || typeof input !== 'object') fail('not an object')
  const { width, height, strokes } = input as Record<string, unknown>
  if (!isNum(width, 1, DRAW_LIMITS.maxCanvas) || !isNum(height, 1, DRAW_LIMITS.maxCanvas)) fail('canvas size')
  if (!Array.isArray(strokes)) fail('strokes')
  const list = strokes as unknown[]
  if (list.length > DRAW_LIMITS.maxStrokes) fail('too many strokes')
  let total = 0
  const out: DrawStroke[] = list.map((raw, i) => {
    if (!raw || typeof raw !== 'object') fail(`stroke ${i}`)
    const s = raw as Record<string, unknown>
    if (s.tool !== 'pen' && s.tool !== 'highlighter') fail(`stroke ${i} tool`)
    if (typeof s.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(s.color)) fail(`stroke ${i} color`)
    if (!isNum(s.width, 0.1, DRAW_LIMITS.maxWidth)) fail(`stroke ${i} width`)
    if (!isNum(s.opacity, 0.05, 1)) fail(`stroke ${i} opacity`)
    if (s.straight !== undefined && typeof s.straight !== 'boolean') fail(`stroke ${i} straight`)
    if (s.pressure !== undefined && typeof s.pressure !== 'boolean') fail(`stroke ${i} pressure`)
    if (!Array.isArray(s.points) || s.points.length < 1 || s.points.length > DRAW_LIMITS.maxPointsPerStroke) fail(`stroke ${i} points`)
    const pts = s.points as unknown[]
    if (s.straight && pts.length !== 2) fail(`stroke ${i} straight needs 2 points`)
    total += pts.length
    if (total > DRAW_LIMITS.maxTotalPoints) fail('too many points')
    const points = pts.map((p) => {
      if (!Array.isArray(p) || p.length !== 3) fail(`stroke ${i} point`)
      const [x, y, pr] = p as unknown[]
      if (!isNum(x, -DRAW_LIMITS.maxCoord, DRAW_LIMITS.maxCoord) || !isNum(y, -DRAW_LIMITS.maxCoord, DRAW_LIMITS.maxCoord) || !isNum(pr, 0, 1))
        fail(`stroke ${i} point range`)
      return [x, y, pr] as [number, number, number]
    })
    return {
      tool: s.tool as DrawTool,
      color: (s.color as string).toLowerCase(),
      width: s.width as number,
      opacity: s.opacity as number,
      points,
      ...(s.straight ? { straight: true } : {}),
      ...(s.pressure ? { pressure: true } : {})
    }
  })
  return { width: width as number, height: height as number, strokes: out }
}
