import { parseCredential, parsePairingFragment, type DeviceCredential } from '@shared/sync/protocol'

/**
 * Where the iPad keeps its device credential. localStorage of this origin (the Mac's Bonjour name + fixed port), and —
 * because iPadOS gives a home-screen web app its own storage, separate from Safari's — also the page URL's fragment
 * whenever Safari shows the page: the home-screen app then starts with that URL (deliberately no web-app manifest —
 * it would pin the first-loaded one-time QR URL), adopts the credential and strips it. Fragments never reach the server.
 */

const KEY = 'sidera.ipad.device'

export function storedCredential(): DeviceCredential | null {
  try {
    return parseCredential(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return null
  }
}

export function saveCredential(c: DeviceCredential | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c))
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the fragment still works for this launch */
  }
}

const DEVICE_FRAGMENT = /^#device=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/

export const credentialFragment = (c: DeviceCredential): string => `#device=${c.deviceId}.${c.deviceKey}`

function fragmentCredential(hash: string): DeviceCredential | null {
  const m = DEVICE_FRAGMENT.exec(hash)
  return m ? parseCredential({ deviceId: m[1], deviceKey: m[2] }) : null
}

export const isStandalone = (): boolean =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** What this launch starts with: a pairing from a fresh QR scan, and/or a credential (stored or from the URL). */
export function readLaunch(): { pairing: { id: string; key: Uint8Array } | null; credential: DeviceCredential | null; fallback: DeviceCredential | null } {
  const hash = location.hash
  const pairing = parsePairingFragment(hash)
  const fromUrl = fragmentCredential(hash)
  const stored = storedCredential()
  if (pairing || (fromUrl && isStandalone())) history.replaceState(null, '', location.pathname)
  if (!stored && fromUrl) saveCredential(fromUrl)
  return { pairing, credential: stored ?? fromUrl, fallback: stored && fromUrl && fromUrl.deviceId !== stored.deviceId ? fromUrl : null }
}
