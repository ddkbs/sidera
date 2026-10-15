import { LogoMark } from './Logo'
import { GridPulse } from './GridPulse'
import { DownloadButton, DownloadMeta } from './DownloadButton'
import { GithubButton } from './GithubButton'
import { Section } from './Frame'
import { REPO_URL } from '../lib'

export function Cta() {
  return (
    <Section className="relative overflow-hidden">
      <GridPulse ambient={3} className="[mask-image:radial-gradient(ellipse_70%_80%_at_50%_50%,black_25%,transparent_80%)]" />
      <div className="relative z-10 flex flex-col items-center px-5 py-28 text-center md:py-36">
        <div data-grid-avoid className="mb-8 grid size-16 place-items-center rounded-2xl border border-border-strong bg-panel shadow-[0_0_60px_-10px_var(--brand)]">
          <LogoMark className="size-8" />
        </div>
        <h2 data-grid-avoid className="guard text-[clamp(40px,6.5vw,80px)] font-semibold leading-[0.95] tracking-[-0.045em]">
          Start a board.
        </h2>
        <p data-grid-avoid className="guard mt-5 max-w-[40ch] text-[17px] leading-relaxed text-muted-foreground">
          Free, open source and yours. Download Sidera for macOS and put your next idea on one board.
        </p>
        <div data-grid-avoid className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton size="lg" />
          <GithubButton className="h-12 px-5 text-[15px]" />
        </div>
        <div data-grid-avoid className="mt-5">
          <DownloadMeta />
        </div>
      </div>
    </Section>
  )
}

export function Footer() {
  const links: [string, string][] = [
    ['GitHub', REPO_URL],
    ['Releases', `${REPO_URL}/releases`],
    ['Changelog', `${REPO_URL}/blob/main/CHANGELOG.md`],
    ['Security', `${REPO_URL}/blob/main/SECURITY.md`],
    ['License (MIT)', `${REPO_URL}/blob/main/LICENSE`]
  ]
  return (
    <Section>
      <div className="flex flex-col items-start justify-between gap-6 px-5 py-10 md:flex-row md:items-center md:px-8">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <LogoMark className="size-5 text-foreground" />
          <span className="font-medium text-foreground">Sidera</span>
          <span className="font-mono text-xs text-faint">· visual notes, local-first</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
          {links.map(([l, h]) => (
            <a key={l} href={h} target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">
              {l}
            </a>
          ))}
        </nav>
      </div>
    </Section>
  )
}
