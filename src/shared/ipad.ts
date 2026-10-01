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
  /** LAN server up (devices paired, or a board shared) */
  running: boolean
  /** the shared whiteboard (whose iPad button was pressed last); null = not sharing, the iPad waits */
  board: { id: string; name: string } | null
  /** e.g. http://ddkbs-MacBook-Pro.local:47821 */
  origin: string | null
  /** LAN address the server is bound to */
  address: string | null
  /** devices connected right now */
  connected: { id: string; name: string }[]
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

export type IpadShareResult = { ok: true; status: IpadStatus } | { ok: false; message: string }

export interface IpadBridge {
  status(): Promise<IpadStatus>
  /** Share this board (starting the server if needed), or move the iPad to it. */
  share(whiteboardId: string): Promise<IpadShareResult>
  /** Stop sharing (the iPad waits; the server keeps running while devices are paired). */
  stop(): Promise<void>
  /** One-time pairing QR (server must be running). */
  pair(): Promise<IpadPairing | { error: string }>
  revokeDevice(id: string): Promise<void>
  onStatus(cb: (s: IpadStatus) => void): () => void
}
