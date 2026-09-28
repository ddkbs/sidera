import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { DrawServer, MAX_AUTH_FAILURES, companionHeaders, type DrawTimeouts } from '../src/main/draw/server'
import { isPrivateIPv4, lanInterfaces } from '../src/main/draw/network'
import {
  DRAW_LIMITS,
  DRAW_MAX_BODY_BYTES,
  fromB64u,
  open,
  seal,
  toB64u,
  validateSubmission,
  type DrawImage,
  type DrawSubmission,
  type Envelope,
  type Message
} from '../src/shared/drawProtocol'
import type { DrawState } from '../src/shared/draw'

const HTML = '<!doctype html><html><head><style>body{margin:0}</style></head><body><script>console.log(1)</script></body></html>'

type Outgoing = { type: string; [k: string]: unknown }

const servers: DrawServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close('test-end')))
})

async function startServer(timeouts?: Partial<DrawTimeouts>) {
  const states: { state: DrawState; reason?: string }[] = []
  const received: DrawSubmission[] = []
  const s = await DrawServer.start({
    address: '127.0.0.1',
    html: HTML,
    host: 'Test Mac',
    onStatus: (state, reason) => states.push({ state, reason }),
    onReceived: (d) => received.push(d),
    timeouts,
    log: () => undefined
  })
  servers.push(s)
  return { s, states, received }
}

/** A minimal companion client driving the protocol with the shared crypto module. */
function client(s: DrawServer, key = fromB64u(new URL(s.url).hash.slice(1))) {
  const sessionId = new URL(s.url).pathname.split('/')[2]
  const api = `http://127.0.0.1:${s.port}/d/${sessionId}/api`
  let seq = Date.now()
  let lastS2c = 0
  const post = (body: unknown) => fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return {
    sessionId,
    post,
    envelope: (msg: Outgoing, n = ++seq): Envelope => seal(key, sessionId, 'c2s', { ...msg, seq: n }),
    async send(msg: Outgoing): Promise<Message> {
      const n = ++seq
      const res = await post(seal(key, sessionId, 'c2s', { ...msg, seq: n }))
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const reply = open(key, sessionId, 's2c', await res.json())
      expect(reply.seq).toBeGreaterThan(lastS2c)
      expect(reply.re).toBe(n)
      lastS2c = reply.seq
      return reply
    }
  }
}

const drawing: DrawSubmission = {
  width: 1180,
  height: 820,
  strokes: [
    { tool: 'pen', color: '#1e1e1e', width: 4, opacity: 1, pressure: true, points: [[10, 10, 0.4], [20, 14, 0.5], [30, 22, 0.6]] },
    { tool: 'pen', color: '#1971c2', width: 4, opacity: 1, straight: true, points: [[100, 100, 0.5], [300, 120, 0.5]] },
    { tool: 'highlighter', color: '#f08c00', width: 24, opacity: 0.35, points: [[50, 200, 0.5], [250, 205, 0.5]] }
  ]
}

/** a real 1×1 PNG */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const b64 = (bytes: number[], pad = 0): string => Buffer.concat([Buffer.from(bytes), Buffer.alloc(pad)]).toString('base64')
const JPEG_B64 = b64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46], 30)
const WEBP_B64 = b64([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20], 30)
const image: DrawImage = { id: 'img_1', mime: 'image/png', data: PNG_B64, x: 40, y: 60, width: 300, height: 200, strokesBelow: 1 }
const withImages: DrawSubmission = {
  ...drawing,
  images: [image, { ...image, id: 'img-2', mime: 'image/jpeg', data: JPEG_B64 }, { ...image, id: 'Img3', mime: 'image/webp', data: WEBP_B64, strokesBelow: undefined }]
}

const refused = async (s: DrawServer): Promise<boolean> => {
  try {
    await fetch(`http://127.0.0.1:${s.port}/d/${s.sessionId}`)
    return false
  } catch {
    return true
  }
}

describe('draw protocol', () => {
  it('round-trips base64url and envelopes, and rejects tampering / wrong direction / wrong key', () => {
    const bytes = new Uint8Array(Array.from({ length: 67 }, (_, i) => (i * 37) & 255))
    for (let n = 0; n < 67; n++) expect(fromB64u(toB64u(bytes.subarray(0, n)))).toEqual(bytes.subarray(0, n))
    expect(toB64u(new Uint8Array([251, 255]))).toBe(Buffer.from([251, 255]).toString('base64url'))
    const key = new Uint8Array(32).fill(7)
    const env = seal(key, 'sid', 'c2s', { type: 'ping', seq: 1 })
    expect(open(key, 'sid', 'c2s', env)).toEqual({ type: 'ping', seq: 1 })
    expect(() => open(key, 'sid', 's2c', env)).toThrow()
    expect(() => open(key, 'other', 'c2s', env)).toThrow()
    expect(() => open(new Uint8Array(32).fill(8), 'sid', 'c2s', env)).toThrow()
    const c = fromB64u(env.c)
    c[0] ^= 1
    expect(() => open(key, 'sid', 'c2s', { ...env, c: toB64u(c) })).toThrow()
  })

  it('validates drawings strictly', () => {
    expect(validateSubmission(drawing).strokes).toHaveLength(3)
    const bad = (patch: Record<string, unknown>) => () => validateSubmission({ ...drawing, strokes: [{ ...drawing.strokes[0], ...patch }] })
    expect(bad({ tool: 'eraser' })).toThrow()
    expect(bad({ color: 'red' })).toThrow()
    expect(bad({ color: '#12345g' })).toThrow()
    expect(bad({ width: 0 })).toThrow()
    expect(bad({ opacity: 2 })).toThrow()
    expect(bad({ points: [[1, 2]] })).toThrow()
    expect(bad({ points: [[1, 2, 5]] })).toThrow()
    expect(bad({ points: [[Infinity, 2, 0.5]] })).toThrow()
    expect(bad({ straight: true })).toThrow()
    expect(() => validateSubmission({ ...drawing, width: -1 })).toThrow()
    expect(() => validateSubmission({ ...drawing, strokes: Array(5001).fill(drawing.strokes[0]) })).toThrow()
    // unknown keys are dropped
    const clean = validateSubmission({ ...drawing, evil: 1, strokes: [{ ...drawing.strokes[0], __proto__x: 1 }] })
    expect(Object.keys(clean.strokes[0])).not.toContain('__proto__x')
  })

  it('validates images strictly', () => {
    const ok = validateSubmission(withImages)
    expect(ok.images).toHaveLength(3)
    expect(ok.images![2].strokesBelow).toBe(0)
    expect(validateSubmission(drawing).images).toEqual([])
    const bad = (patch: Record<string, unknown>) => () => validateSubmission({ ...drawing, images: [{ ...image, ...patch }] })
    // wrong / unsupported types and mismatching magic bytes
    expect(bad({ mime: 'image/gif' })).toThrow(/type/)
    expect(bad({ mime: 'image/svg+xml' })).toThrow(/type/)
    expect(bad({ mime: 'image/jpeg' })).toThrow(/does not match/)
    expect(bad({ mime: 'image/webp', data: JPEG_B64 })).toThrow(/does not match/)
    expect(bad({ data: b64([0x3c, 0x73, 0x76, 0x67], 20) })).toThrow(/does not match/)
    // malformed data
    expect(bad({ data: 'data:image/png;base64,' + PNG_B64 })).toThrow(/data/)
    expect(bad({ data: PNG_B64.slice(0, -1) })).toThrow(/data/)
    expect(bad({ data: 42 })).toThrow(/data/)
    // oversize: one image, and all of them together
    const big = PNG_B64.slice(0, 12) + 'A'.repeat(Math.ceil(DRAW_LIMITS.maxImageBytes / 3) * 4 - 12)
    expect(bad({ data: big })).toThrow(/data|too large/)
    const nearCap = PNG_B64.slice(0, 12) + 'A'.repeat(Math.floor((DRAW_LIMITS.maxImageBytes - 1024) / 3) * 4 - 12)
    expect(() => validateSubmission({ ...drawing, images: [0, 1, 2, 3].map((i) => ({ ...image, id: `a${i}`, data: nearCap })) })).not.toThrow()
    expect(() => validateSubmission({ ...drawing, images: [0, 1, 2, 3, 4, 5].map((i) => ({ ...image, id: `a${i}`, data: nearCap })) })).toThrow(/images too large/)
    // count, ids, bounds, order
    expect(() => validateSubmission({ ...drawing, images: Array.from({ length: 21 }, (_, i) => ({ ...image, id: `i${i}` })) })).toThrow(/too many images/)
    expect(() => validateSubmission({ ...drawing, images: [image, image] })).toThrow(/id/)
    expect(bad({ id: '../x' })).toThrow(/id/)
    expect(bad({ id: '' })).toThrow(/id/)
    expect(bad({ x: Infinity })).toThrow(/bounds/)
    expect(bad({ width: 0 })).toThrow(/bounds/)
    expect(bad({ height: 1e9 })).toThrow(/bounds/)
    expect(bad({ y: '1' })).toThrow(/bounds/)
    expect(bad({ strokesBelow: 4 })).toThrow(/order/)
    expect(bad({ strokesBelow: 0.5 })).toThrow(/order/)
    expect(() => validateSubmission({ ...drawing, images: {} })).toThrow(/images/)
    // unknown keys are dropped
    expect(Object.keys(validateSubmission({ ...drawing, images: [{ ...image, onload: 'x' }] }).images![0])).not.toContain('onload')
  })
})

describe('draw server', () => {
  it('serves the companion page with strict headers and 404s everything else', async () => {
    const { s } = await startServer()
    const base = `http://127.0.0.1:${s.port}`
    const page = await fetch(`${base}/d/${s.sessionId}`)
    expect(page.status).toBe(200)
    expect(await page.text()).toBe(HTML)
    const csp = page.headers.get('content-security-policy')!
    expect(csp).toContain("default-src 'none'")
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/=]+'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(page.headers.get('cache-control')).toBe('no-store')
    expect(page.headers.get('referrer-policy')).toBe('no-referrer')
    expect(page.headers.get('x-frame-options')).toBe('DENY')
    expect(page.headers.get('access-control-allow-origin')).toBeNull()
    for (const path of ['/', `/d/${s.sessionId.slice(0, -1)}A`, `/d/${s.sessionId}/other`, `/d/${s.sessionId}?x=1`, '/favicon.ico']) {
      const r = await fetch(base + path)
      expect(r.status, path).toBe(404)
      expect(await r.text()).toBe('')
    }
    expect((await fetch(`${base}/d/${s.sessionId}/api`)).status).toBe(405)
    expect((await fetch(`${base}/d/${s.sessionId}/api`, { method: 'POST', body: '{}' })).status).toBe(415)
  })

  it('computes CSP hashes of inline script and style', () => {
    const h = companionHeaders(HTML)['Content-Security-Policy']
    expect(h).toContain("'sha256-")
    expect(h).toContain('style-src')
  })

  it('pairs, rejects tampered/replayed/wrong-key/foreign messages, accepts a drawing and then closes the port', async () => {
    const { s, states, received } = await startServer()
    const c = client(s)
    const hello = await c.send({ type: 'hello' })
    expect(hello.type).toBe('ok')
    expect(hello.host).toBe('Test Mac')
    const token = hello.token as string
    expect(token).toBeTruthy()
    expect(states.map((x) => x.state)).toEqual(['waiting', 'connected'])

    // wrong key
    const intruder = client(s, new Uint8Array(32).fill(1))
    expect((await intruder.post(intruder.envelope({ type: 'hello' }))).status).toBe(400)
    // tampered ciphertext
    const env = c.envelope({ type: 'ping', token })
    const bytes = fromB64u(env.c)
    bytes[bytes.length - 1] ^= 0x80
    expect((await c.post({ ...env, c: toB64u(bytes) })).status).toBe(400)
    // replay of an accepted message
    const ping = c.envelope({ type: 'ping', token })
    expect((await c.post(ping)).status).toBe(200)
    expect((await c.post(ping)).status).toBe(400)
    // a second device that also has the key cannot take over the session
    const other = client(s)
    expect((await other.send({ type: 'hello' })).error).toBe('already-paired')
    expect((await other.send({ type: 'submit', drawing })).error).toBe('not-paired')
    // invalid drawing is refused without closing
    expect((await c.send({ type: 'submit', token, drawing: { ...drawing, width: 'x' } })).error).toBe('invalid-drawing')
    expect(received).toHaveLength(0)

    const ok = await c.send({ type: 'submit', token, drawing })
    expect(ok).toMatchObject({ type: 'ok', done: true })
    expect(received).toEqual([validateSubmission(drawing)])
    await new Promise((r) => setTimeout(r, 50))
    expect(s.closed).toBe(true)
    expect(states.at(-1)).toEqual({ state: 'closed', reason: 'received' })
    expect(await refused(s)).toBe(true)
  })

  it('accepts a drawing with images and rejects invalid images without closing', async () => {
    const { s, received } = await startServer()
    const c = client(s)
    const token = (await c.send({ type: 'hello' })).token as string
    const wrong = await c.send({ type: 'submit', token, drawing: { ...withImages, images: [{ ...image, mime: 'image/webp' }] } })
    expect(wrong).toMatchObject({ type: 'error', error: 'invalid-drawing' })
    expect(s.closed).toBe(false)
    expect(await c.send({ type: 'submit', token, drawing: withImages })).toMatchObject({ type: 'ok', done: true })
    expect(received).toHaveLength(1)
    expect(received[0].images!.map((i) => i.id)).toEqual(['img_1', 'img-2', 'Img3'])
    expect(received[0].images![0].data).toBe(PNG_B64)
  })

  it('refuses oversized bodies (declared or streamed) before decrypting', async () => {
    const { s } = await startServer()
    const path = `/d/${s.sessionId}/api`
    const status = (headers: Record<string, string | number>, body?: (write: (b: Buffer) => boolean) => void): Promise<number | 'reset'> =>
      new Promise((resolve) => {
        const req = request({ host: '127.0.0.1', port: s.port, path, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        })
        req.on('error', () => resolve('reset'))
        if (body) body((b) => req.write(b))
        req.end()
      })
    // the server drops the socket as soon as the cap is exceeded, so the client sees a 413 or a reset
    expect([413, 'reset']).toContain(await status({ 'content-length': DRAW_MAX_BODY_BYTES + 1 }))
    const chunk = Buffer.alloc(1024 * 1024, 0x61)
    const streamed = await status({ 'transfer-encoding': 'chunked' }, (write) => {
      for (let i = 0; i <= DRAW_MAX_BODY_BYTES / chunk.length; i++) write(chunk)
    })
    expect([413, 'reset']).toContain(streamed)
    // the session itself survives (an oversized body is not an authenticated message)
    expect(s.closed).toBe(false)
    expect((await client(s).send({ type: 'hello' })).type).toBe('ok')
  })

  it('closes after too many authentication failures', async () => {
    const { s, states } = await startServer()
    const intruder = client(s, new Uint8Array(32).fill(3))
    for (let i = 0; i < MAX_AUTH_FAILURES; i++) await intruder.post(intruder.envelope({ type: 'hello' })).catch(() => undefined)
    await new Promise((r) => setTimeout(r, 50))
    expect(states.at(-1)).toEqual({ state: 'closed', reason: 'auth-failures' })
    expect(await refused(s)).toBe(true)
  })

  it('closes when nobody pairs in time, and when the paired device goes silent', async () => {
    const a = await startServer({ pairMs: 60, tickMs: 20 })
    await new Promise((r) => setTimeout(r, 200))
    expect(a.states.at(-1)).toEqual({ state: 'closed', reason: 'pairing-timeout' })
    expect(await refused(a.s)).toBe(true)

    const b = await startServer({ staleMs: 60, idleMs: 150, tickMs: 20 })
    await client(b.s).send({ type: 'hello' })
    await new Promise((r) => setTimeout(r, 400))
    expect(b.states.map((x) => x.state)).toEqual(['waiting', 'connected', 'disconnected', 'closed'])
    expect(b.states.at(-1)?.reason).toBe('heartbeat-timeout')
  })

  it('releases the port on close()', async () => {
    const { s } = await startServer()
    await s.close('cancelled')
    expect(await refused(s)).toBe(true)
  })
})

describe('lan interfaces', () => {
  it('keeps private IPv4 only, en0 first', () => {
    expect(isPrivateIPv4('192.168.1.20')).toBe(true)
    expect(isPrivateIPv4('172.31.0.1')).toBe(true)
    expect(isPrivateIPv4('172.32.0.1')).toBe(false)
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4('127.0.0.1')).toBe(false)
    expect(isPrivateIPv4('169.254.1.1')).toBe(false)
    const info = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null })
    const list = lanInterfaces({
      utun3: [info('10.8.0.2')],
      lo0: [info('127.0.0.1', true)],
      en5: [info('192.168.2.3')],
      en0: [info('192.168.1.20'), { ...info('fe80::1'), family: 'IPv6' as const, scopeid: 0 }],
      en1: [info('84.12.3.4')]
    })
    expect(list.map((i) => i.address)).toEqual(['192.168.1.20', '192.168.2.3', '10.8.0.2'])
    expect(list[0].label).toBe('Wi-Fi')
  })
})
