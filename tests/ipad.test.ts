import { mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'
import { DeviceStore } from '../src/main/ipad/devices'
import { BoardScope, PolicyError, referencedFileIds } from '../src/main/ipad/policy'
import { IpadServer } from '../src/main/ipad/server'
import { HANDSHAKE_NONCE_BYTES, KEY_BYTES, SecureChannel, fromB64u, randomBytes, toB64u, type Message } from '../src/shared/sync/crypto'
import { parseHello, parsePairingFragment, pairingUrl, validateUpload, writeScopes } from '../src/shared/sync/protocol'
import { fileUrl } from '../src/shared/fileProtocol'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('sync crypto', () => {
  const secret = randomBytes(KEY_BYTES)
  const cn = randomBytes(HANDSHAKE_NONCE_BYTES)
  const sn = randomBytes(HANDSHAKE_NONCE_BYTES)
  const pair = () => [new SecureChannel(secret, cn, sn, 'device', 'dev1', 'client'), new SecureChannel(secret, cn, sn, 'device', 'dev1', 'server')] as const

  it('round-trips both ways with increasing sequence numbers', () => {
    const [c, s] = pair()
    expect(s.open(c.seal({ type: 'call', x: 1 }))).toMatchObject({ type: 'call', x: 1, seq: 1 })
    expect(s.open(c.seal({ type: 'ping' })).seq).toBe(2)
    expect(c.open(s.seal({ type: 'pong' })).type).toBe('pong')
  })

  it('rejects replays, reflections, tampering and frames from another connection', () => {
    const [c, s] = pair()
    const f = c.seal({ type: 'ping' })
    s.open(f)
    expect(() => s.open(f)).toThrow(/replayed/)
    // a client frame echoed back to the client (other direction key)
    expect(() => c.open(c.seal({ type: 'ping' }))).toThrow()
    const g = c.seal({ type: 'ping' })
    expect(() => s.open({ ...g, c: g.c.slice(0, -2) + (g.c.endsWith('A') ? 'BA' : 'AA') })).toThrow()
    // same secret, different handshake nonces → different keys
    const other = new SecureChannel(secret, randomBytes(HANDSHAKE_NONCE_BYTES), sn, 'device', 'dev1', 'server')
    expect(() => other.open(c.seal({ type: 'ping' }))).toThrow()
    // bound to the id
    const wrongId = new SecureChannel(secret, cn, sn, 'device', 'dev2', 'server')
    expect(() => wrongId.open(c.seal({ type: 'ping' }))).toThrow()
  })
})

describe('sync protocol', () => {
  it('parses pairing links and hello frames strictly', () => {
    const key = randomBytes(KEY_BYTES)
    const id = toB64u(randomBytes(16))
    const url = pairingUrl('http://mac.local:47821', id, key)
    const parsed = parsePairingFragment(new URL(url).hash)
    expect(parsed?.id).toBe(id)
    expect(toB64u(parsed!.key)).toBe(toB64u(key))
    expect(parsePairingFragment('#pair=abc.def')).toBeNull()
    const cn = toB64u(randomBytes(HANDSHAKE_NONCE_BYTES))
    expect(parseHello(JSON.stringify({ t: 'hello', v: 1, mode: 'device', id, cn })).mode).toBe('device')
    expect(() => parseHello(JSON.stringify({ t: 'hello', v: 1, mode: 'admin', id, cn }))).toThrow()
    expect(() => parseHello(JSON.stringify({ t: 'hello', v: 1, mode: 'device', id: 'x', cn }))).toThrow()
  })

  it('validates image uploads by type, magic bytes and size', () => {
    expect(validateUpload({ name: '../../etc/passwd.png', mime: 'image/png', dataBase64: PNG })).toMatchObject({ name: 'etcpasswd.png', mime: 'image/png' })
    expect(() => validateUpload({ name: 'a.svg', mime: 'image/svg+xml', dataBase64: PNG })).toThrow()
    expect(() => validateUpload({ name: 'a.jpg', mime: 'image/jpeg', dataBase64: PNG })).toThrow(/does not match/)
    expect(() => validateUpload({ name: 'a.png', mime: 'image/png', dataBase64: 'A'.repeat(21 * 1024 * 1024) })).toThrow(/too large/)
  })

  it('maps writes to change scopes, reads to none', () => {
    expect(writeScopes('updateObjects')).toEqual(['whiteboards'])
    expect(writeScopes('getWhiteboard')).toBeNull()
    expect(writeScopes('listCards')).toBeNull()
  })
})

describe('board scope policy', () => {
  let api: Services
  let board: string
  let other: string
  let scope: BoardScope
  let onBoardCard: string
  let offBoardCard: string
  let note: string
  beforeEach(() => {
    api = createServices(openDatabase(':memory:'))
    board = api.createWhiteboard({ name: 'Shared' }).id
    other = api.createWhiteboard({ name: 'Private' }).id
    onBoardCard = api.createCard({ title: 'On board' }).id
    offBoardCard = api.createCard({ title: 'Secret' }).id
    api.addObject({ whiteboardId: board, kind: 'card', refId: onBoardCard, x: 0, y: 0 })
    note = api.addObject({ whiteboardId: board, kind: 'sketch', x: 0, y: 0, data: { text: fileUrl('img1') } }).id
    api.addObject({ whiteboardId: other, kind: 'card', refId: offBoardCard, x: 0, y: 0 })
    scope = new BoardScope(api, board)
  })
  const denied = (fn: () => unknown) => expect(fn).toThrow(PolicyError)

  it('reads only the shared board, its cards and its files', () => {
    expect(scope.authorize('getWhiteboard', [board])).toEqual({ args: [board] })
    denied(() => scope.authorize('getWhiteboard', [other]))
    expect(scope.authorize('getCard', [onBoardCard])).toEqual({ args: [onBoardCard] })
    denied(() => scope.authorize('getCard', [offBoardCard]))
    expect(scope.fileAllowed('img1')).toBe(true)
    expect(scope.fileAllowed('img2')).toBe(false)
    for (const m of ['listCards', 'listWhiteboards', 'importFiles', 'openFile', 'exportMarkdown', 'getMcpInfo', 'deleteWhiteboard'] as const) denied(() => scope.authorize(m, []))
  })

  it('writes only objects of the shared board and strips foreign fields', () => {
    const foreign = api.getWhiteboard(other)!.objects[0].id
    denied(() => scope.authorize('updateObjects', [[{ id: foreign, x: 1 }]]))
    denied(() => scope.authorize('removeObjects', [[foreign]]))
    denied(() => scope.authorize('addObject', [{ whiteboardId: other, kind: 'text', x: 0, y: 0 }]))
    denied(() => scope.authorize('addObject', [{ whiteboardId: board, kind: 'card', refId: offBoardCard, x: 0, y: 0 }]))
    denied(() => scope.authorize('restoreObjects', [[{ ...api.getObject(foreign)!, whiteboardId: board }], []]))
    const ok = scope.authorize('updateObjects', [[{ id: note, x: 5, whiteboardId: other, kind: 'card' }]]) as { args: unknown[] }
    expect(ok.args[0]).toEqual([{ id: note, x: 5 }])
    // viewport-only updates never touch the Mac's saved viewport
    expect('result' in scope.authorize('updateWhiteboard', [{ id: board, viewport: { x: 1, y: 2, zoom: 3 } }])).toBe(true)
  })

  it('remembers cards it created, so they can be placed and undone', () => {
    const card = api.createCard({ title: 'New' })
    denied(() => scope.authorize('getCard', [card.id]))
    scope.learn('createCard', card)
    expect(scope.authorize('addObject', [{ whiteboardId: board, kind: 'card', refId: card.id, x: 0, y: 0 }])).toHaveProperty('args')
  })

  it('search (mentions) only finds cards placed on the shared board', () => {
    const d = scope.authorize('search', ['', 10]) as { args: unknown[]; post: (h: unknown) => unknown }
    const hits = d.post(api.search(...(d.args as Parameters<Services['search']>))) as { id: string }[]
    expect(hits.map((h) => h.id)).toEqual([onBoardCard])
  })

  it('finds file references in stored content (both URL schemes)', () => {
    expect([...referencedFileIds({ a: 'sidera-file://files/x%20y', b: ['canvascl-file://files/z'] })]).toEqual(['x y', 'z'])
  })
})

// ─── server end to end (real sockets, Node's WebSocket client) ──────────────────────────────────────

interface TestClient {
  ws: WebSocket
  channel: SecureChannel
  next: () => Promise<Message>
  send: (m: { type: string; [k: string]: unknown }) => void
  closed: Promise<number>
}

async function connect(port: number, mode: 'device' | 'pair', id: string, secret: Uint8Array, first: { type: string; [k: string]: unknown }): Promise<TestClient> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/sync`)
  const queue: string[] = []
  const waiters: ((s: string) => void)[] = []
  ws.onmessage = (e) => (waiters.length ? waiters.shift()!(String(e.data)) : queue.push(String(e.data)))
  const closed = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)))
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  const raw = (): Promise<string> => (queue.length ? Promise.resolve(queue.shift()!) : new Promise((r) => waiters.push(r)))
  const cn = randomBytes(HANDSHAKE_NONCE_BYTES)
  ws.send(JSON.stringify({ t: 'hello', v: 1, mode, id, cn: toB64u(cn) }))
  const challenge = JSON.parse(await raw())
  if (challenge.t !== 'challenge') throw new Error(challenge.reason)
  const channel = new SecureChannel(secret, cn, fromB64u(challenge.sn), mode, id, 'client')
  const send = (m: { type: string; [k: string]: unknown }) => ws.send(JSON.stringify(channel.seal(m)))
  send(first)
  return { ws, channel, send, closed, next: async () => channel.open(JSON.parse(await raw())) }
}

describe('iPad server', () => {
  let api: Services
  let server: IpadServer
  let devices: DeviceStore
  let board: string
  const writes: string[][] = []
  beforeEach(async () => {
    api = createServices(openDatabase(':memory:'))
    board = api.createWhiteboard({ name: 'Shared' }).id
    const dir = mkdtempSync(join(tmpdir(), 'sidera-ipad-'))
    writeFileSync(join(dir, 'ipad.html'), '<!doctype html><title>iPad</title>')
    devices = new DeviceStore(join(dir, 'devices.json'), null)
    server = await IpadServer.start({
      address: '127.0.0.1',
      port: 0,
      bonjourHost: null,
      macName: 'Test Mac',
      staticDir: dir,
      devices,
      services: api,
      call: async (method, args) => (api[method as keyof Services] as (...a: unknown[]) => unknown)(...args),
      readFile: async () => null,
      settings: () => ({ theme: 'dark', font: 'geist', fontSize: 15, editor: { spellcheck: true }, canvas: { showMinimap: false, snapToGrid: false }, language: 'en' }),
      onWrite: (s) => void writes.push(s),
      onStatus: () => {},
      log: () => {}
    })
  })
  afterEach(() => server.close('test'))

  it('pairs once with the QR secret, then lists the boards and works on the one it opened', async () => {
    const { url } = server.createPairing()
    const p = parsePairingFragment(new URL(url).hash)!
    const pairing = await connect(server.port, 'pair', p.id, p.key, { type: 'pair', name: 'Test iPad' })
    const paired = await pairing.next()
    expect(paired).toMatchObject({ type: 'paired', host: 'Test Mac' })
    expect(devices.list()).toHaveLength(1)
    // one-time: the same pairing can't be used again
    await expect(connect(server.port, 'pair', p.id, p.key, { type: 'pair', name: 'Again' })).rejects.toThrow(/pairing-expired/)

    const key = fromB64u(paired.deviceKey as string)
    const dev = await connect(server.port, 'device', paired.deviceId as string, key, { type: 'auth', name: 'Test iPad' })
    expect(await dev.next()).toMatchObject({ type: 'welcome', board: null, settings: { theme: 'dark' } })

    // before opening a board: only the board list and previews
    const other = api.createWhiteboard({ name: 'Other' }).id
    dev.send({ type: 'call', id: 10, method: 'getWhiteboard', args: [board] })
    expect(await dev.next()).toMatchObject({ type: 'result', id: 10, ok: false })
    dev.send({ type: 'call', id: 11, method: 'listWhiteboardsWithStats', args: [] })
    const list = await dev.next()
    expect((list.data as { name: string; properties: unknown[] }[]).map((w) => w.name).sort()).toEqual(['Other', 'Shared'])
    expect((list.data as { properties: unknown[] }[]).every((w) => w.properties.length === 0)).toBe(true)

    dev.send({ type: 'open', boardId: 'nope' })
    expect(await dev.next()).toMatchObject({ type: 'board', board: null })
    dev.send({ type: 'open', boardId: board })
    expect(await dev.next()).toMatchObject({ type: 'board', board: { id: board, name: 'Shared' } })
    expect(server.connected).toMatchObject([{ name: 'Test iPad', board: { id: board } }])
    // scoped to the open board: another board is refused
    dev.send({ type: 'call', id: 12, method: 'getWhiteboard', args: [other] })
    expect(await dev.next()).toMatchObject({ type: 'result', id: 12, ok: false })

    dev.send({ type: 'call', id: 1, method: 'getWhiteboard', args: [board] })
    expect(await dev.next()).toMatchObject({ type: 'result', id: 1, ok: true, data: { whiteboard: { id: board } } })
    dev.send({ type: 'call', id: 2, method: 'listCards', args: [] })
    expect(await dev.next()).toMatchObject({ type: 'result', id: 2, ok: false })
    dev.send({ type: 'call', id: 3, method: 'addObject', args: [{ whiteboardId: board, kind: 'sketch', x: 1, y: 2, data: { text: 'hi' } }] })
    expect(await dev.next()).toMatchObject({ type: 'result', id: 3, ok: true })
    expect(writes.at(-1)).toEqual(['whiteboards'])
    expect(api.getWhiteboard(board)!.objects).toHaveLength(1)

    // pushes from the Mac
    server.notifyChanged(['cards'])
    expect(await dev.next()).toMatchObject({ type: 'changed', scopes: ['cards'] })
    // the open board renamed, then deleted on the Mac: the device follows, then is back at the list
    api.updateWhiteboard({ id: board, name: 'Renamed' })
    server.notifyChanged(['whiteboards'])
    expect(await dev.next()).toMatchObject({ type: 'board', board: { id: board, name: 'Renamed' } })
    expect(await dev.next()).toMatchObject({ type: 'changed' })
    api.deleteWhiteboard(board)
    server.notifyChanged(['whiteboards'])
    expect(await dev.next()).toMatchObject({ type: 'board', board: null })
    expect(await dev.next()).toMatchObject({ type: 'changed' })

    // a replayed frame kills the connection
    const frame = JSON.stringify(dev.channel.seal({ type: 'ping' }))
    dev.ws.send(frame)
    expect(await dev.next()).toMatchObject({ type: 'pong' })
    dev.ws.send(frame)
    expect(await dev.closed).toBe(4400)
  })

  it('rejects unknown devices and revoked ones', async () => {
    await expect(connect(server.port, 'device', toB64u(randomBytes(16)), randomBytes(KEY_BYTES), { type: 'auth', name: 'x' })).rejects.toThrow(/unknown-device/)
    const d = devices.add('iPad')
    const dev = await connect(server.port, 'device', d.id, fromB64u(d.key), { type: 'auth', name: 'iPad' })
    await dev.next()
    devices.remove(d.id)
    server.disconnectDevice(d.id)
    expect(await dev.closed).toBe(4403)
    // wrong key for a known device: the first sealed frame fails → rejected
    const e = devices.add('iPad 2')
    const bad = await connect(server.port, 'device', e.id, randomBytes(KEY_BYTES), { type: 'auth', name: 'x' })
    expect(await bad.closed).toBe(4401)
  })

  it('serves the app only under its own host name (DNS rebinding) with a strict CSP', async () => {
    const get = (host: string, path = '/') =>
      new Promise<{ status: number; csp?: string }>((resolve, reject) =>
        request({ host: '127.0.0.1', port: server.port, path, headers: { Host: host } }, (res) => {
          res.resume()
          resolve({ status: res.statusCode!, csp: res.headers['content-security-policy'] as string | undefined })
        })
          .on('error', reject)
          .end()
      )
    const ok = await get(`127.0.0.1:${server.port}`)
    expect(ok.status).toBe(200)
    expect(ok.csp).toContain("script-src 'self'")
    expect((await get('evil.example:80')).status).toBe(404)
    expect((await get(`127.0.0.1:${server.port}`, '/../devices.json')).status).toBe(404)
  })
})
