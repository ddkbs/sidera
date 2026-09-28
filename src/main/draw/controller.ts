import { execFileSync } from 'node:child_process'
import { hostname } from 'node:os'
import QRCode from 'qrcode'
import { SIDERA_DRAW_EVENT, type DrawEvent, type DrawStartResult } from '@shared/draw'
import { lanInterfaces } from './network'
import { DrawServer } from './server'

let macName: string | null = null
/** "ddkbs's MacBook Pro" (falls back to the host name). Shown on the iPad, inside the encrypted channel only. */
function computerName(): string {
  if (macName) return macName
  try {
    macName = execFileSync('/usr/sbin/scutil', ['--get', 'ComputerName'], { encoding: 'utf8', timeout: 1000 }).trim()
  } catch {
    macName = ''
  }
  if (!macName) macName = hostname().replace(/\.local$/, '')
  return macName
}

/**
 * Owns at most one Sidera Draw session per signed-in Session. Kept apart from the MCP server on purpose:
 * its own short-lived port on a LAN address, its own crypto, nothing but the drawing hand-off.
 */
export class DrawController {
  private current: { server: DrawServer; whiteboardId: string } | null = null
  /** bumped by every start/close, so a start that finishes after a newer call never leaves a port open */
  private generation = 0

  constructor(
    private html: () => string,
    private send: (channel: string, e: DrawEvent) => void
  ) {}

  async start(whiteboardId: string, address?: string): Promise<DrawStartResult> {
    await this.close('replaced')
    const gen = this.generation
    const interfaces = lanInterfaces()
    const chosen = interfaces.find((i) => i.address === address) ?? interfaces[0]
    if (!chosen)
      return { ok: false, error: 'no-network', message: 'Connect your Mac to Wi-Fi (the same network as your iPad) and try again.' }
    let server: DrawServer
    try {
      server = await DrawServer.start({
        address: chosen.address,
        html: this.html(),
        host: computerName(),
        onStatus: (state, reason, sessionId) => this.send(SIDERA_DRAW_EVENT, { type: 'status', sessionId, state, reason }),
        onReceived: (drawing, sessionId) => this.send(SIDERA_DRAW_EVENT, { type: 'received', sessionId, whiteboardId, drawing })
      })
    } catch (e) {
      return { ok: false, error: 'failed', message: `Could not open a local connection: ${(e as Error).message}` }
    }
    if (gen !== this.generation) {
      await server.close('cancelled')
      return { ok: false, error: 'failed', message: 'Cancelled' }
    }
    this.current = { server, whiteboardId }
    const url = server.url
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
    return { ok: true, sessionId: server.sessionId, url, qrSvg, address: chosen.address, interfaces, host: computerName() }
  }

  /** Closes the running session (if any); the port is released when this resolves. */
  async close(reason = 'cancelled'): Promise<void> {
    this.generation++
    const c = this.current
    this.current = null
    if (c) await c.server.close(reason)
  }
}
