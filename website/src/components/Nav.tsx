import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { GithubButton } from './GithubButton'
import { DownloadButton } from './DownloadButton'

const LINKS = [
  ['Boards', '#boards'],
  ['MCP', '#mcp'],
  ['iPad', '#ipad'],
  ['Local-first', '#local'],
  ['Changelog', 'https://github.com/ddkbs/sidera/blob/main/CHANGELOG.md']
] as const

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={`sticky top-0 z-50 transition-colors duration-300 ${scrolled ? 'bg-background/75 backdrop-blur-xl' : ''}`}>
      <div className="relative mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 md:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[14px] text-muted-foreground lg:flex">
          {LINKS.map(([label, href]) => (
            <a key={label} href={href} className="transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <GithubButton />
          </div>
          <DownloadButton short />
        </div>
        <div className={`dash-x absolute inset-x-0 bottom-0 h-px transition-opacity ${scrolled ? 'opacity-100' : 'opacity-0'}`} />
      </div>
    </header>
  )
}
