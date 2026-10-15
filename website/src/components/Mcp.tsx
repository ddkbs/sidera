import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { IconCheck, IconCopy } from 'obra-icons-react'
import { Kbd, Reveal, Section, SectionHeader } from './Frame'

type Tab = { id: string; label: string; copy: string; code: ReactNode }

const k = (s: string) => <span className="text-[#7dd3fc]">{s}</span>
const str = (s: string) => <span className="text-[#bef264]">{s}</span>
const dim = (s: string) => <span className="text-faint">{s}</span>

const TABS: Tab[] = [
  {
    id: 'code',
    label: 'Claude Code',
    copy: 'claude mcp add --scope user --transport http sidera http://127.0.0.1:3845/mcp',
    code: (
      <>
        {dim('# one line, while Sidera is running')}
        {'\n'}
        {k('claude')} mcp add --scope user \{'\n'}
        {'  '}--transport http sidera \{'\n'}
        {'  '}
        {str('http://127.0.0.1:3845/mcp')}
        {'\n\n'}
        {dim('# then just ask')}
        {'\n'}
        {k('>')} build a Q3 board from {str('./revenue.csv')}
        {'\n'}
        {'  '}with a linked chart and the key risks
      </>
    )
  },
  {
    id: 'desktop',
    label: 'Claude Desktop',
    copy: '{ "mcpServers": { "sidera": { "command": "/Applications/Sidera.app/Contents/MacOS/Sidera", "args": ["--mcp-stdio"] } } }',
    code: (
      <>
        {dim('// Settings → MCP & Claude → Connect.')}
        {'\n'}
        {dim('// One click writes this for you:')}
        {'\n'}
        {'{'}
        {'\n'}
        {'  '}
        {k('"mcpServers"')}: {'{'}
        {'\n'}
        {'    '}
        {k('"sidera"')}: {'{'}
        {'\n'}
        {'      '}
        {k('"command"')}: {str('"…/Sidera.app/Contents/MacOS/Sidera"')},{'\n'}
        {'      '}
        {k('"args"')}: [{str('"--mcp-stdio"')}]{'\n'}
        {'    }'}
        {'\n'}
        {'  }'}
        {'\n'}
        {'}'}
      </>
    )
  },
  {
    id: 'any',
    label: 'Any client',
    copy: 'http://127.0.0.1:3845/mcp',
    code: (
      <>
        {dim('# Streamable HTTP, local only')}
        {'\n'}
        {k('POST')} {str('http://127.0.0.1:3845/mcp')}
        {'\n\n'}
        {dim('# or headless over stdio')}
        {'\n'}
        {k('Sidera')} --mcp-stdio{'\n\n'}
        {dim('# 50+ tools, e.g.')}
        {'\n'}
        get_whiteboard · add_table · add_chart{'\n'}
        add_ink · add_mindmap · connect_objects{'\n'}
        search_cards · organize_board · …
      </>
    )
  }
]

export function Mcp() {
  const [tab, setTab] = useState(TABS[0])
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(tab.copy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }
  return (
    <Section id="mcp" className="px-5 py-24 md:px-8 md:py-32">
      <SectionHeader index="06" eyebrow="MCP-first" title="Claude builds the board with you.">
        Every core action is an MCP tool. Claude Desktop, Claude Code or any MCP client can read your boards and lay out tables, linked charts, ink and diagrams — and the in-app chat (<Kbd>⌘</Kbd> <Kbd>J</Kbd>) uses the very same tools.
      </SectionHeader>

      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        <Reveal className="flex flex-col overflow-hidden rounded-xl border border-border bg-panel">
          <div className="flex items-center justify-between border-b border-border pl-2 pr-3">
            <div className="flex">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t)}
                  className={`relative px-4 py-3.5 font-mono text-[12.5px] transition-colors ${tab.id === t.id ? 'text-foreground' : 'text-faint hover:text-muted-foreground'}`}
                >
                  {t.label}
                  {tab.id === t.id && <motion.span layoutId="tab-underline" className="absolute inset-x-3 -bottom-px h-px bg-foreground" />}
                </button>
              ))}
            </div>
            <button onClick={copy} aria-label="Copy" className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
              {copied ? <IconCheck size={15} className="text-c-green" /> : <IconCopy size={15} />}
            </button>
          </div>
          <AnimatePresence mode="wait">
            <motion.pre
              key={tab.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="min-h-[340px] flex-1 overflow-x-auto p-6 font-mono text-[13px] leading-[1.75] text-foreground/90"
            >
              {tab.code}
            </motion.pre>
          </AnimatePresence>
        </Reveal>
        <Reveal delay={0.1}>
          <LiveBoard />
        </Reveal>
      </div>

      <Reveal className="mt-4 overflow-hidden rounded-xl border border-border bg-panel">
        <div className="grid items-center md:grid-cols-[1fr_1.5fr]">
          <div className="p-6 md:p-8">
            <div className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">07 · In-app chat · bring your own key</div>
            <h3 className="text-[22px] font-semibold tracking-[-0.02em]">Ask the board.</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              Claude, OpenAI, Gemini, Mistral, OpenRouter or a local Ollama model — your key, encrypted on your Mac. Optional native web search. Anything an external agent can do, the chat can do too.
            </p>
          </div>
          <div className="relative h-full min-h-[260px] border-t border-border md:border-l md:border-t-0">
            <img src="/shots/ai-chat-dark.webp" alt="The in-app Claude chat summarizing the board next to it" loading="lazy" className="absolute inset-0 size-full object-cover object-[100%_0%]" />
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

/** The tool calls an agent makes, played back while a mini board fills in. */
const STEPS = [
  { tool: 'create_whiteboard', arg: '"Q3 review"', ms: 38 },
  { tool: 'add_table', arg: 'revenue · 4×2', ms: 21 },
  { tool: 'add_chart', arg: 'column ← table', ms: 27 },
  { tool: 'add_text_block', arg: '"Key risks"', ms: 12 },
  { tool: 'connect_objects', arg: 'table → note', ms: 9 },
  { tool: 'add_ink', arg: 'circle Q3', ms: 16 }
]

function LiveBoard() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-100px' })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!inView) return
    const t = setInterval(() => setN((v) => (v >= STEPS.length + 4 ? 0 : v + 1)), 900)
    return () => clearInterval(t)
  }, [inView])
  const shown = Math.min(n, STEPS.length)
  return (
    <div ref={ref} className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="font-mono text-[12.5px] text-muted-foreground">Live board</span>
        <span className="flex items-center gap-1.5 rounded border border-c-green/30 bg-c-green/10 px-2 py-0.5 font-mono text-[11px] text-c-green">
          <span className="size-1.5 animate-pulse rounded-full bg-c-green" /> mcp · connected
        </span>
      </div>
      <div className="border-b border-border px-5 py-3 font-mono text-[12px] leading-[1.9]">
        {STEPS.map((s, i) => (
          <div key={s.tool} className={`flex items-center gap-2 transition-opacity duration-300 ${i < shown ? 'opacity-100' : 'opacity-20'}`}>
            <span className={i < shown ? 'text-c-green' : 'text-faint'}>{i < shown ? '✓' : '○'}</span>
            <span className="text-[#7dd3fc]">{s.tool}</span>
            <span className="truncate text-faint">{s.arg}</span>
            <span className="ml-auto tabular-nums text-faint">{i < shown ? `${s.ms}ms` : ''}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-faint">
          <span>{'>'}</span>
          <span className={`inline-block h-3.5 w-[7px] bg-foreground/70 ${shown < STEPS.length ? 'animate-blink' : 'opacity-0'}`} />
        </div>
      </div>
      <MiniBoard step={shown} />
    </div>
  )
}

const BARS = [38, 52, 46, 78]

function MiniBoard({ step }: { step: number }) {
  const pop = (on: boolean) => ({ initial: false, animate: on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } })
  return (
    <div className="dots relative min-h-[230px] flex-1 overflow-hidden bg-[#0c0c0f]">
      <motion.div {...pop(step >= 1)} className="absolute left-[5%] top-[10%] rounded-md border border-white/10 bg-[#141418] px-2.5 py-1.5 text-[11px] font-semibold">
        Q3 review
      </motion.div>
      {/* table */}
      <motion.div {...pop(step >= 2)} className="absolute left-[5%] top-[30%] w-[30%] rounded-md border border-white/10 bg-[#141418] p-2 text-[9px]">
        <div className="mb-1 font-semibold text-foreground/80">Revenue (€m)</div>
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
          <div key={q} className="flex justify-between border-t border-white/5 py-[3px] text-muted-foreground">
            <span>{q} 26</span>
            <span className="tabular-nums">{BARS[i]}</span>
          </div>
        ))}
      </motion.div>
      {/* linked chart */}
      <motion.div {...pop(step >= 3)} className="absolute left-[40%] top-[30%] h-[58%] w-[30%] rounded-md border border-white/10 bg-[#141418] p-2">
        <div className="flex items-center justify-between text-[9px] font-semibold text-foreground/80">
          Revenue <span className="rounded bg-white/5 px-1 font-normal text-faint">⇄ table</span>
        </div>
        <div className="absolute inset-x-3 bottom-3 top-7 flex items-end gap-[10%]">
          {BARS.map((b, i) => (
            <motion.div key={i} initial={false} animate={{ height: step >= 3 ? `${b}%` : '0%' }} transition={{ delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="flex-1 rounded-t-[2px] bg-c-blue" style={i === 3 ? { background: 'var(--c-green)' } : undefined} />
          ))}
        </div>
      </motion.div>
      {/* note */}
      <motion.div {...pop(step >= 4)} className="absolute right-[4%] top-[14%] w-[22%] rounded-md border border-c-red/30 bg-c-red/10 p-2 text-[9px] text-c-red">
        <div className="mb-0.5 font-semibold">Key risks</div>• FX exposure
        <br />• Hiring pace
      </motion.div>
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {/* connector table → note */}
        <motion.path d="M35 40 C 55 40, 60 26, 74 26" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" strokeDasharray="1.2 1" vectorEffect="non-scaling-stroke" initial={false} animate={{ pathLength: step >= 5 ? 1 : 0, opacity: step >= 5 ? 1 : 0 }} transition={{ duration: 0.6 }} />
        {/* ink circle around the last bar */}
        <motion.ellipse cx="65.5" cy="60" rx="4.5" ry="20" fill="none" stroke="var(--c-purple)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" initial={false} animate={{ pathLength: step >= 6 ? 1 : 0, opacity: step >= 6 ? 1 : 0 }} transition={{ duration: 0.8, ease: 'easeInOut' }} transform="rotate(-6 65.5 60)" />
      </svg>
    </div>
  )
}
