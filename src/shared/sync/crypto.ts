/**
 * Crypto for Sidera for iPad — pure (no Node/Electron/DOM-only APIs; only `crypto.getRandomValues`, which also exists
 * on plain-HTTP pages where WebCrypto's `subtle` does not), so the same code runs in the main process, in the iPad web
 * app and in unit tests.
 *
 * Every connection derives fresh per-direction keys from a long-lived secret (the device key, or the one-time pairing
 * key) and two random nonces, one from each side: HKDF-SHA256(secret, salt = clientNonce ‖ serverNonce). Messages are
 * XChaCha20-Poly1305 sealed under those keys and carry a sequence number that must strictly increase per direction, so
 * a frame can neither be replayed inside a connection nor into another one (other nonces → other keys).
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { bytesToUtf8, randomBytes, utf8ToBytes } from '@noble/ciphers/utils.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

export const SYNC_PROTOCOL_VERSION = 1
export const KEY_BYTES = 32
export const NONCE_BYTES = 24
export const HANDSHAKE_NONCE_BYTES = 16

// ─── base64url (no Buffer / atob: runs everywhere) ──────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const B64_LOOKUP = new Int8Array(128).fill(-1)
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i

export function toB64u(bytes: Uint8Array): string {
  // chunked: file transfers make envelopes tens of MB, so avoid one giant += chain
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

/** Decodes a base64url value that must be exactly `bytes` long (keys, nonces, ids). */
export function fixedB64u(s: unknown, bytes: number): Uint8Array {
  if (typeof s !== 'string' || s.length !== Math.ceil((bytes * 4) / 3)) throw new Error('bad length')
  const b = fromB64u(s)
  if (b.length !== bytes) throw new Error('bad length')
  return b
}

// ─── channel ────────────────────────────────────────────────────────────────────────────────────────

/** Ciphertext frame as it travels over any transport (LAN WebSocket today, a cloud relay later). */
export interface SealedFrame {
  t: 'm'
  n: string
  c: string
}

/** Every decrypted message carries a type and a per-direction strictly increasing sequence number. */
export interface Message {
  type: string
  seq: number
  [k: string]: unknown
}

export type Role = 'client' | 'server'
export type ChannelMode = 'device' | 'pair'

function deriveKey(secret: Uint8Array, clientNonce: Uint8Array, serverNonce: Uint8Array, label: string): Uint8Array {
  const salt = new Uint8Array(clientNonce.length + serverNonce.length)
  salt.set(clientNonce)
  salt.set(serverNonce, clientNonce.length)
  return hkdf(sha256, secret, salt, utf8ToBytes(`sidera-sync/v${SYNC_PROTOCOL_VERSION}|${label}`), KEY_BYTES)
}

/**
 * One authenticated + encrypted connection. Both ends construct it with the same secret, nonces, mode and id (the
 * device id or pairing id, also bound into the keys), and opposite roles.
 */
export class SecureChannel {
  private sendKey: Uint8Array
  private recvKey: Uint8Array
  private sendSeq = 0
  private recvSeq = 0

  constructor(secret: Uint8Array, clientNonce: Uint8Array, serverNonce: Uint8Array, mode: ChannelMode, id: string, role: Role) {
    if (secret.length !== KEY_BYTES) throw new Error('bad key')
    const c2s = deriveKey(secret, clientNonce, serverNonce, `${mode}|${id}|c2s`)
    const s2c = deriveKey(secret, clientNonce, serverNonce, `${mode}|${id}|s2c`)
    this.sendKey = role === 'client' ? c2s : s2c
    this.recvKey = role === 'client' ? s2c : c2s
  }

  seal(msg: Omit<Message, 'seq'> & { type: string }): SealedFrame {
    const nonce = randomBytes(NONCE_BYTES)
    const body = utf8ToBytes(JSON.stringify({ ...msg, seq: ++this.sendSeq }))
    return { t: 'm', n: toB64u(nonce), c: toB64u(xchacha20poly1305(this.sendKey, nonce).encrypt(body)) }
  }

  /** Decrypts + authenticates a frame and enforces the sequence; throws on anything forged, malformed or replayed. */
  open(frame: unknown): Message {
    if (!frame || typeof frame !== 'object') throw new Error('bad frame')
    const { t, n, c } = frame as Record<string, unknown>
    if (t !== 'm' || typeof c !== 'string') throw new Error('bad frame')
    const nonce = fixedB64u(n, NONCE_BYTES)
    const plain = xchacha20poly1305(this.recvKey, nonce).decrypt(fromB64u(c))
    const msg = JSON.parse(bytesToUtf8(plain)) as Message
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string' || !Number.isSafeInteger(msg.seq)) throw new Error('bad message')
    if (msg.seq <= this.recvSeq) throw new Error('replayed message')
    this.recvSeq = msg.seq
    return msg
  }
}

export { randomBytes }
