import { IconBrandAppleFill } from 'obra-icons-react'
import { RELEASES_URL, useRepoInfo } from '../lib'

/** Primary CTA: the Apple-silicon DMG of the latest release (falls back to the releases page). */
export function DownloadButton({ size = 'md', short, className = '' }: { size?: 'md' | 'lg'; short?: boolean; className?: string }) {
  const { release } = useRepoInfo()
  const big = size === 'lg'
  return (
    <a
      href={release?.arm64 ?? RELEASES_URL}
      className={`group inline-flex shrink-0 items-center whitespace-nowrap justify-center gap-2 rounded-md bg-white font-medium text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_8px_30px_-8px_rgba(120,140,255,0.45)] transition-all duration-200 hover:bg-white/90 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_10px_40px_-6px_rgba(120,140,255,0.7)] ${big ? 'h-12 px-6 text-[15px]' : 'h-9 px-4 text-sm'} ${className}`}
    >
      <IconBrandAppleFill size={big ? 18 : 15} className="-mt-0.5" />
      {short ? (
        <>
          <span className="sm:hidden">Download</span>
          <span className="hidden sm:inline">Download for Mac</span>
        </>
      ) : (
        'Download for Mac'
      )}
    </a>
  )
}

/** Small mono line under a download CTA: version + Intel build. */
export function DownloadMeta() {
  const { release } = useRepoInfo()
  return (
    <p className="font-mono text-xs text-muted-foreground">
      {release?.version ? `v${release.version}` : 'Latest'} · Apple silicon ·{' '}
      <a href={release?.x64 ?? RELEASES_URL} className="underline decoration-white/20 underline-offset-4 hover:text-foreground">
        Intel build
      </a>{' '}
      · Free &amp; MIT
    </p>
  )
}
