import { useEffect, useState } from 'react'

export const REPO = 'ddkbs/sidera'
export const REPO_URL = `https://github.com/${REPO}`
export const RELEASES_URL = `${REPO_URL}/releases/latest`

export type Release = { version: string; arm64?: string; x64?: string }

/** One shared fetch per page load: latest release assets + star count from the public GitHub API. */
let repoInfo: Promise<{ stars?: number; release?: Release }> | null = null
function loadRepoInfo() {
  repoInfo ??= Promise.all([
    fetch(`https://api.github.com/repos/${REPO}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  ]).then(([repo, rel]) => {
    const assets: { name: string; browser_download_url: string }[] = rel?.assets ?? []
    const dmg = (arch: string) => assets.find((a) => a.name.endsWith(`-${arch}.dmg`))?.browser_download_url
    return {
      stars: typeof repo?.stargazers_count === 'number' ? repo.stargazers_count : undefined,
      release: rel ? { version: String(rel.tag_name ?? '').replace(/^v/, ''), arm64: dmg('arm64'), x64: dmg('x64') } : undefined
    }
  })
  return repoInfo
}

export function useRepoInfo() {
  const [info, setInfo] = useState<{ stars?: number; release?: Release }>({})
  useEffect(() => {
    let live = true
    loadRepoInfo().then((i) => live && setInfo(i))
    return () => {
      live = false
    }
  }, [])
  return info
}

export function formatStars(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}
