import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import QRCode from 'qrcode'
import type { ApiMethod, DbChangeScope } from '@shared/api'
import type { IpadPairing, IpadShareResult, IpadStatus } from '@shared/ipad'
import { IPAD_DEFAULT_PORT, type MirroredSettings } from '@shared/sync/protocol'
import type { Services } from '../services'
import { DeviceStore, type SecretBox } from './devices'
import { lanInterfaces } from './network'
import { IpadServer } from './server'

const scutil = (key: string): string => {
  try {
    return execFileSync('/usr/sbin/scutil', ['--get', key], { encoding: 'utf8', timeout: 1000 }).trim()
  } catch {
    return ''
  }
}

let names: { mac: string; bonjour: string | null } | null = null
/** "ddkbs's MacBook Pro" (shown on the iPad) and "ddkbs-MacBook-Pro.local" (stable address across IP changes). */
function machineNames(): { mac: string; bonjour: string | null } {
  if (names) return names
  const local = scutil('LocalHostName')
  names = {
    mac: scutil('ComputerName') || hostname().replace(/\.local$/, ''),
    bonjour: /^[A-Za-z0-9-]{1,63}$/.test(local) ? `${local}.local` : null
  }
  return names
}

export interface IpadControllerDeps {
  dataDir: string
  services: Services
  box: SecretBox | null
  call: (method: ApiMethod, args: unknown[]) => Promise<unknown>
  readFile: (fileId: string) => Promise<{ mime: string; bytes: Buffer } | null>
  settings: () => MirroredSettings
  /** a device wrote data */
  onWrite: (scopes: DbChangeScope[]) => void
  sendStatus: (s: IpadStatus) => void
}

/** The built iPad web app (vite.ipad.config.ts → out/ipad), next to out/main in dev and inside app.asar when packaged. */
const staticDir = (): string | null => {
  const dir = join(__dirname, '../ipad')
  return existsSync(join(dir, 'ipad.html')) ? dir : null
}

/**
 * Sidera for iPad, per Session: the paired devices and the LAN server. The server runs while devices are paired (so
 * the home-screen app always opens, showing "waiting" until a board is shared) or while a board is shared (pairing).
 * Pressing the iPad button on a board shares it / moves the iPad to it; pressing it again stops sharing.
 */
export class IpadController {
  readonly devices: DeviceStore
  private server: IpadServer | null = null
  /** bumped by every start/stop, so a start that finishes after a newer call never leaves a port open */
  private generation = 0
  private starting: Promise<{ ok: true } | { ok: false; message: string }> | null = null

  constructor(private deps: IpadControllerDeps) {
    this.devices = new DeviceStore(join(deps.dataDir, 'ipad-devices.bin'), deps.box)
  }

  status(): IpadStatus {
    const s = this.server
    return {
      running: !!s,
      board: s?.currentBoard ?? null,
      origin: s?.origin ?? null,
      address: s ? s.ipOrigin.replace(/^http:\/\//, '') : null,
      connected: s?.connected ?? [],
      devices: this.devices.list()
    }
  }

  private emit(): void {
    this.deps.sendStatus(this.status())
  }

  /** While devices are paired the server stays up (app + authenticated connections) so the iPad app always opens. */
  async autostart(): Promise<void> {
    if (!this.server && this.devices.list().length) await this.ensureServer()
  }

  private ensureServer(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (this.server) return Promise.resolve({ ok: true })
    // one start at a time (autostart and a button press may race for the same port)
    this.starting ??= this.startServer().finally(() => (this.starting = null))
    return this.starting
  }

  private async startServer(): Promise<{ ok: true } | { ok: false; message: string }> {
    const gen = this.generation
    const dir = staticDir()
    if (!dir) return { ok: false, message: 'The iPad app is not built (run `npm run build:ipad`).' }
    const lan = lanInterfaces()[0]
    if (!lan) return { ok: false, message: 'Connect your Mac to Wi-Fi (the same network as your iPad) and try again.' }
    const port = Number(process.env.SIDERA_IPAD_PORT) || IPAD_DEFAULT_PORT
    const { mac, bonjour } = machineNames()
    let server: IpadServer
    try {
      server = await IpadServer.start({
        address: lan.address,
        port,
        bonjourHost: bonjour,
        macName: mac,
        staticDir: dir,
        devices: this.devices,
        services: this.deps.services,
        call: this.deps.call,
        readFile: this.deps.readFile,
        settings: this.deps.settings,
        onWrite: this.deps.onWrite,
        onStatus: () => this.emit()
      })
    } catch (e) {
      const busy = (e as NodeJS.ErrnoException).code === 'EADDRINUSE'
      return { ok: false, message: busy ? `Port ${port} is already in use on this Mac.` : `Could not start the iPad connection: ${(e as Error).message}` }
    }
    if (gen !== this.generation) {
      await server.close('cancelled')
      return { ok: false, message: 'Cancelled' }
    }
    this.server = server
    return { ok: true }
  }

  /** Show this board on the iPad (starting the server if needed, or moving the iPad over from another board). */
  async share(whiteboardId: string): Promise<IpadShareResult> {
    const board = this.deps.services.getWhiteboard(whiteboardId)?.whiteboard
    if (!board) return { ok: false, message: 'Whiteboard not found' }
    const started = await this.ensureServer()
    if (!started.ok) return started
    this.server!.setBoard({ id: board.id, name: board.name })
    this.emit()
    return { ok: true, status: this.status() }
  }

  /** Stop sharing: the iPad goes back to "waiting"; the server itself only stops when no device is paired. */
  async stop(): Promise<void> {
    if (this.devices.list().length) {
      this.server?.setBoard(null)
      this.emit()
    } else await this.shutdown('stopped')
  }

  /** Closes the server for good (sign-out, last device revoked). */
  async shutdown(reason: string): Promise<void> {
    this.generation++
    const s = this.server
    this.server = null
    if (s) await s.close(reason)
    this.emit()
  }

  async pair(): Promise<IpadPairing | { error: string }> {
    if (!this.server) return { error: 'Start the iPad connection on a whiteboard first.' }
    const p = this.server.createPairing()
    const qr = (url: string): Promise<string> =>
      QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    return { url: p.url, ipUrl: p.ipUrl, qrSvg: await qr(p.url), ipQrSvg: await qr(p.ipUrl), expiresAt: p.expiresAt }
  }

  revoke(id: string): void {
    this.devices.remove(id)
    this.server?.disconnectDevice(id)
    // last device gone and nothing shared: nobody needs the server any more
    if (!this.devices.list().length && !this.server?.currentBoard) void this.shutdown('no-devices')
    else this.emit()
  }

  /** The shared board was renamed / deleted. */
  refreshBoard(): void {
    const s = this.server
    const b = s?.currentBoard
    if (!s || !b) return
    const board = this.deps.services.getWhiteboard(b.id)?.whiteboard
    if (!board) return void this.stop()
    if (board.name !== b.name) {
      s.setBoard({ id: board.id, name: board.name })
      this.emit()
    }
  }

  notifyChanged(scopes: DbChangeScope[]): void {
    this.server?.notifyChanged(scopes)
    if (scopes.includes('whiteboards') || scopes.includes('all')) this.refreshBoard()
  }

  pushSettings(settings: MirroredSettings): void {
    this.server?.pushSettings(settings)
  }
}
