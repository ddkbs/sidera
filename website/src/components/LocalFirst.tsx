import { IconDownload, IconShieldCheck, IconCode } from 'obra-icons-react'
import { Reveal, Section, SectionHeader } from './Frame'
import { GithubButton } from './GithubButton'

const TREE: [string, string, string?][] = [
  ['~/Library/Application Support/Sidera/', ''],
  ['├─ sidera.db', 'SQLite · boards, cards, FTS5 search', 'var(--c-blue)'],
  ['├─ files/', 'images & PDFs you drop in', 'var(--c-green)'],
  ['├─ settings.json', 'plain JSON', 'var(--c-orange)'],
  ['└─ keys', 'AES-GCM, never the Keychain', 'var(--c-purple)'],
  ['', ''],
  ['network', ''],
  ['├─ mcp     127.0.0.1:3845', 'loopback only', 'var(--c-blue)'],
  ['├─ ipad    LAN · e2e', 'only while a board is shared', 'var(--c-green)'],
  ['└─ cloud   —', 'none', 'var(--c-red)']
]

const PILLARS = [
  [IconShieldCheck, 'No cloud account. Ever.', 'Local accounts with an optional password, or a guest workspace that is wiped on sign-out.'],
  [IconDownload, 'Your data, your format', 'Markdown export and import any time. A folder you can back up, sync or inspect.'],
  [IconCode, 'MIT, built in the open', 'Read the code, file an issue, send a PR. Free — no tiers, no telemetry wall.']
] as const

export function LocalFirst() {
  return (
    <Section id="local" className="px-5 py-24 md:px-8 md:py-32">
      <SectionHeader index="09" eyebrow="Local-first · open source" title="It lives on your Mac. Full stop.">
        Sidera is a native-feeling macOS app with a SQLite database in a folder you own. The MCP server only listens on 127.0.0.1.
      </SectionHeader>
      <div className="mt-14 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Reveal className="overflow-hidden rounded-xl border border-border bg-panel">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5 font-mono text-[12.5px] text-muted-foreground">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
              <span className="size-2.5 rounded-full bg-white/10" />
            </span>
            <span className="ml-2">tree — your data</span>
          </div>
          <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-[2.1]">
            {TREE.map(([path, note, color], i) => (
              <div key={i} className="flex gap-6 whitespace-pre">
                <span className={color ? 'text-foreground/90' : 'text-muted-foreground'}>
                  {color && <span className="mr-2 inline-block size-1.5 -translate-y-px rounded-full" style={{ background: color }} />}
                  {path || ' '}
                </span>
                {note && <span className="text-faint"># {note}</span>}
              </div>
            ))}
          </pre>
        </Reveal>
        <div className="flex flex-col gap-4">
          {PILLARS.map(([Icon, title, body], i) => (
            <Reveal key={title} delay={i * 0.08} className="flex flex-1 gap-4 rounded-xl border border-border bg-panel p-5">
              <Icon size={18} className="mt-0.5 shrink-0 text-[#a9b8ff]" />
              <div>
                <div className="text-[15.5px] font-medium">{title}</div>
                <div className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{body}</div>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.24}>
            <GithubButton className="h-11 w-full" />
          </Reveal>
        </div>
      </div>
    </Section>
  )
}
