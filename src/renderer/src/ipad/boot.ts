import type { DeviceCredential } from '@shared/sync/protocol'
import { installBridge } from './bridge'
import { SyncClient } from './client'
import { readLaunch } from './credentials'
import { installLongPress } from './longPress'
import { installPalmRejection } from './palm'

export interface Launch {
  client: SyncClient
  pairing: { id: string; key: Uint8Array } | null
  credential: DeviceCredential | null
  /** credential from the home-screen URL, tried when the stored one is rejected */
  fallback: DeviceCredential | null
  deviceName: string
}

/** iPadOS Safari reports a Mac user agent by default: tell by the touch screen. */
const deviceName = (): string =>
  /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 ? 'iPad' : 'Browser'

/** Runs before any app module: installs the window.* shims the shared renderer code expects. */
export function boot(): Launch {
  const launch = readLaunch()
  const name = deviceName()
  const client = new SyncClient(launch.credential, name)
  installBridge(client)
  installPalmRejection()
  installLongPress()
  return { client, ...launch, deviceName: name }
}
