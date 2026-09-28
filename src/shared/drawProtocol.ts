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
/**
 * Request body cap (bytes), enforced by the server while streaming, before decrypting. Sized for the worst case:
 * all images at their total cap (base64 inside JSON = ×4/3) plus the stroke limits, all inside a base64url envelope (×4/3).
 */
export const DRAW_MAX_BODY_BYTES = 48 * 1024 * 1024
export const DRAW_HEARTBEAT_MS = 10_000

export const DRAW_LIMITS = {
  maxStrokes: 5000,
  maxPointsPerStroke: 20_000,
  maxTotalPoints: 400_000,
  maxCoord: 100_000,
  maxCanvas: 20_000,
  maxWidth: 200,
  maxImages: 20,
  /** decoded bytes per image */
  maxImageBytes: 4 * 1024 * 1024,
  /** decoded bytes of all images together */
  maxTotalImageBytes: 20 * 1024 * 1024
} as const

export const DRAW_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type DrawImageMime = (typeof DRAW_IMAGE_MIMES)[number]

export type Direction = 'c2s' | 's2c'

// ─── base64url (no Buffer / atob: runs everywhere) ──────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_LOOKUP = new Int8Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i

export function toB64u(bytes: Uint8Array): string {
  // chunked: images make envelopes tens of MB, so avoid one giant += chain
  const parts: string[] = []
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
    if (out.length >= 16384) {
      parts.push(out)
      out = ''
    }
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64[n >> 18] + B64[(n >> 12) & 63]
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63]
  }
  parts.push(out)
  return parts.join('')
}

export function fromB64u(s: string): Uint8Array {
  if (typeof s !== 'string' || s.length % 4 === 1) throw new Error('bad base64url')
  const out = new Uint8Array(Math.floor((s.length * 3) / 4))
  let o = 0
  let acc = 0
  let bits = 0
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    const v = code < 128 ? B64_LOOKUP[code] : -1
    if (v < 0) throw new Error('bad base64url')
    acc = ((acc << 6) | v) & 0xffffff
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

/**
 * A photo / screenshot placed on the drawing, in the same companion-canvas coordinates as the strokes.
 * The companion always re-encodes images (downscaled, metadata stripped) before sending them.
 */
export interface DrawImage {
  /** [A-Za-z0-9_-]{1,64}, unique within the submission */
  id: string
  mime: DrawImageMime
  /** standard base64 (no `data:` prefix) of the encoded image */
  data: string
  x: number
  y: number
  width: number
  height: number
  /** how many strokes (from the start of `strokes`) are drawn below this image; the rest are drawn above it. Default 0. */
  strokesBelow?: number
}

export interface DrawSubmission {
  /** visible canvas size on the device (CSS px), for context only */
  width: number
  height: number
  strokes: DrawStroke[]
  images?: DrawImage[]
}

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
  // RIFF....WEBP
  if (mime === 'image/webp') return is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])
  return false
}

const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** Strict shape/range check of a decrypted `submit` payload. Returns a clean copy (unknown keys dropped) or throws. */
export function validateSubmission(input: unknown): DrawSubmission {
  const fail = (why: string): never => {
    throw new Error(`Invalid drawing: ${why}`)
  }
  if (!input || typeof input !== 'object') fail('not an object')
  const { width, height, strokes, images } = input as Record<string, unknown>
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
  return { width: width as number, height: height as number, strokes: out, images: validateImages(images, out.length, fail) }
}

function validateImages(images: unknown, strokeCount: number, fail: (why: string) => never): DrawImage[] {
  if (images === undefined) return []
  if (!Array.isArray(images)) fail('images')
  const list = images as unknown[]
  if (list.length > DRAW_LIMITS.maxImages) fail('too many images')
  const ids = new Set<string>()
  let total = 0
  return list.map((raw, i) => {
    if (!raw || typeof raw !== 'object') fail(`image ${i}`)
    const m = raw as Record<string, unknown>
    if (typeof m.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(m.id) || ids.has(m.id)) fail(`image ${i} id`)
    ids.add(m.id as string)
    if (typeof m.mime !== 'string' || !(DRAW_IMAGE_MIMES as readonly string[]).includes(m.mime)) fail(`image ${i} type`)
    const data = m.data
    // cheap length check first, so an oversized string never reaches the regex
    if (typeof data !== 'string' || data.length < 8 || data.length % 4 !== 0 || data.length > Math.ceil(DRAW_LIMITS.maxImageBytes / 3) * 4)
      fail(`image ${i} data`)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data as string)) fail(`image ${i} data`)
    const bytes = base64Bytes(data as string)
    if (bytes > DRAW_LIMITS.maxImageBytes) fail(`image ${i} too large`)
    total += bytes
    if (total > DRAW_LIMITS.maxTotalImageBytes) fail('images too large')
    if (!imageMagicMatches(m.mime as string, data as string)) fail(`image ${i} content does not match its type`)
    const c = DRAW_LIMITS.maxCoord
    if (!isNum(m.x, -c, c) || !isNum(m.y, -c, c) || !isNum(m.width, 1, c) || !isNum(m.height, 1, c)) fail(`image ${i} bounds`)
    if (m.strokesBelow !== undefined && !(Number.isInteger(m.strokesBelow) && isNum(m.strokesBelow, 0, strokeCount))) fail(`image ${i} order`)
    return {
      id: m.id as string,
      mime: m.mime as DrawImageMime,
      data: data as string,
      x: m.x as number,
      y: m.y as number,
      width: m.width as number,
      height: m.height as number,
      strokesBelow: (m.strokesBelow as number | undefined) ?? 0
    }
  })
}
