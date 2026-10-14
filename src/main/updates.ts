import { app, net } from 'electron'
import { LATEST_RELEASE_API, newerRelease, type UpdateInfo } from '@shared/updates'

/** Ask GitHub for the latest release (fixed URL, no data sent besides the request itself); null when up to date or offline. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await net.fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Sidera/${app.getVersion()}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    return newerRelease(app.getVersion(), await res.json())
  } catch {
    return null
  }
}
