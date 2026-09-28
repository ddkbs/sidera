import type { DrawSubmission } from './drawProtocol'

/** main → renderer event channel of the Sidera Draw (iPad companion) session */
export const SIDERA_DRAW_EVENT = 'sidera-draw:event'

export interface DrawInterface {
  /** macOS interface name, e.g. en0 */
  name: string
  address: string
  /** friendly label for the picker ("Wi-Fi", "Ethernet", …) */
  label: string
}

export type DrawStartResult =
  | { ok: true; sessionId: string; url: string; qrSvg: string; address: string; interfaces: DrawInterface[]; host: string }
  | { ok: false; error: 'no-network' | 'failed'; message: string }

export type DrawState = 'waiting' | 'connected' | 'disconnected' | 'received' | 'closed' | 'error'

export type DrawEvent =
  | { type: 'status'; sessionId: string; state: DrawState; reason?: string }
  | { type: 'received'; sessionId: string; whiteboardId: string; drawing: DrawSubmission }

export interface DrawBridge {
  /** Opens a one-shot LAN session for this whiteboard (closing any previous one). */
  start(whiteboardId: string, address?: string): Promise<DrawStartResult>
  /** Closes the session and its port right away. */
  cancel(): Promise<void>
  onEvent(cb: (e: DrawEvent) => void): () => void
}
