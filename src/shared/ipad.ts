/** Sidera for iPad — desktop-side bridge types (main ↔ desktop renderer). The wire protocol lives in ./sync. */

/** main → renderer: the iPad server's status changed */
export const IPAD_STATUS_EVENT = 'ipad:status'

export interface PairedDevice {
  id: string
  name: string
  createdAt: number
  lastSeenAt: number | null
}

export interface IpadStatus {
  /** the iPad connection is switched on (remembered across restarts) */
  enabled: boolean
  /** LAN server up */
  running: boolean
  /** e.g. http://ddkbs-MacBook-Pro.local:47821 */
  origin: string | null
  /** LAN address the server is bound to */
  address: string | null
  /** devices connected right now, with the whiteboard each has open */
  connected: { id: string; name: string; board: { id: string; name: string } | null }[]
  devices: PairedDevice[]
}

export interface IpadPairing {
  /** QR target via the Mac's Bonjour name (stable across IP changes) */
  url: string
  qrSvg: string
  /** fallback via the IP address, for networks without Bonjour */
  ipUrl: string
  ipQrSvg: string
  expiresAt: number
}

export type IpadStartResult = { ok: true; status: IpadStatus } | { ok: false; message: string }

export interface IpadBridge {
  status(): Promise<IpadStatus>
  /** Switch the iPad connection on: the paired iPads can open every whiteboard. */
  start(): Promise<IpadStartResult>
  /** Switch it off (connected iPads are disconnected; stays off until switched on again). */
  stop(): Promise<void>
  /** One-time pairing QR (server must be running). */
  pair(): Promise<IpadPairing | { error: string }>
  revokeDevice(id: string): Promise<void>
  onStatus(cb: (s: IpadStatus) => void): () => void
}
