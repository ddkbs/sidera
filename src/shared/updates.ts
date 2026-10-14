// Update check against GitHub Releases (no auto-install: the app isn't notarized, so the user downloads the new DMG).

export const REPO_URL = 'https://github.com/ddkbs/sidera'
export const LATEST_RELEASE_API = 'https://api.github.com/repos/ddkbs/sidera/releases/latest'

export interface UpdateInfo {
  version: string
  url: string
}

/** Numeric compare of "1.2.3" / "v1.2.3" (pre-release suffixes ignored); >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The newer release from a GitHub `releases/latest` response, or null when it isn't newer (or malformed). */
export function newerRelease(current: string, release: unknown): UpdateInfo | null {
  const r = release as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown } | null
  if (!r || typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null
  const url = typeof r.html_url === 'string' && r.html_url.startsWith(`${REPO_URL}/`) ? r.html_url : `${REPO_URL}/releases/latest`
  return compareVersions(r.tag_name, current) > 0 ? { version: r.tag_name.replace(/^v/i, ''), url } : null
}
