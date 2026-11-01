import type { ReactNode } from 'react'
import { IconBarChart, IconPen, IconGrid, IconText, IconTable, IconWorkflow, IconImage, IconLink, IconLayers, IconTrendingUp, IconCards, IconConnect } from 'obra-icons-react'
import { Kbd, Reveal, Section, SectionHeader } from './Frame'

const STATS = [
  ['16', 'chart types'],
  ['50+', 'MCP tools'],
  ['0', 'cloud accounts'],
  ['100%', 'on your disk']
]

export function Stats() {
  return (
    <Section>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {STATS.map(([n, label], i) => (
          <Reveal key={label} delay={i * 0.06} className="relative px-6 py-9 md:px-8">
            {i > 0 && <div className={`dash-y absolute inset-y-0 left-0 w-px ${i === 2 ? 'hidden md:block' : ''}`} />}
            <div className="text-[clamp(30px,3.6vw,44px)] font-semibold tracking-[-0.04em] tabular-nums">{n}</div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

const CHART_TYPES = ['Column', 'Bar', 'Line', 'Area', 'Combo', 'Radar', 'Pie', 'Donut', 'Waterfall', 'Scatter', 'Bubble', 'Heatmap', 'Sankey', 'Timeline', '2×2 matrix', 'Venn']

const OBJECTS: [typeof IconText, string][] = [
  [IconText, 'Text boxes'],
  [IconTable, 'Tables'],
  [IconBarChart, 'Charts'],
  [IconPen, 'Pen ink'],
  [IconWorkflow, 'Mermaid'],
  [IconConnect, 'Mindmaps'],
  [IconLayers, 'Sections'],
  [IconImage, 'Images & PDFs'],
  [IconLink, 'Link previews'],
  [IconTrendingUp, 'Stock charts'],
  [IconCards, 'Cards'],
  [IconGrid, 'Nested boards']
]

function Card({ label, title, children, img, imgPos = 'center', zoom = 1, className = '' }: { label: ReactNode; title: string; children: ReactNode; img?: string; imgPos?: string; zoom?: number; className?: string }) {
  return (
    <div className={`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-panel transition-colors duration-300 hover:border-border-strong ${className}`}>
      <div className="dots pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative p-6 md:p-7">
        <div className="mb-4 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">{label}</div>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      </div>
      {img && (
        <div className="relative mt-auto min-h-[220px] flex-1 overflow-hidden border-t border-border">
          {/* Zoom into the part of the app shot that matters; hover pushes in a little further. */}
          <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]" style={{ transformOrigin: imgPos }}>
            <img src={img} alt="" loading="lazy" className="size-full object-cover" style={{ objectPosition: imgPos, transform: `scale(${zoom})`, transformOrigin: imgPos }} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-panel to-transparent" />
        </div>
      )}
    </div>
  )
}

export function Boards() {
  return (
    <Section id="boards" className="px-5 py-24 md:px-8 md:py-32">
      <SectionHeader index="01" eyebrow="Boards first" title="Stop splitting one idea across a dozen docs.">
        Put the numbers, the chart, the sketch and the note next to each other — on an infinite board that stays fast with hundreds of objects.
      </SectionHeader>

      <div className="mt-14 grid gap-4 md:grid-cols-12">
        <Reveal className="md:col-span-7 md:row-span-2">
          <Card
            className="h-full"
            label="02 · Charts"
            title="Charts that live on the board"
            img="/shots/charts-dark.webp"
            imgPos="38% 78%"
            zoom={1.25}
          >
            Every chart is backed by a small table you edit in place — or linked to a table on the board, so it redraws the moment the numbers change. Colour by value, own ticks, labelled markers.
          </Card>
        </Reveal>
        <Reveal delay={0.08} className="md:col-span-5">
          <Card
            label={
              <>
                03 · Pen mode <Kbd>P</Kbd>
              </>
            }
            title="Sketch straight onto the board"
            img="/shots/pen-mode-dark.webp"
            imgPos="50% 100%"
            zoom={1.5}
          >
            Pen, marker, laser pointer, eraser and lasso. Ink is part of the board — circle the bar that matters.
          </Card>
        </Reveal>
        <Reveal delay={0.14} className="md:col-span-5">
          <Card label="04 · Home" title="Every board, previewed live" img="/shots/home-dark.webp" imgPos="62% 30%"
            zoom={1.5}>
            Home shows your boards first, each tile a tiny live sketch of what's on it.
          </Card>
        </Reveal>
      </div>

      {/* Chart-type ticker */}
      <Reveal className="relative mt-4 overflow-hidden rounded-xl border border-border bg-panel py-4 [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max animate-marquee gap-3">
          {[...CHART_TYPES, ...CHART_TYPES].map((t, i) => (
            <span key={i} className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="size-1 rounded-full" style={{ background: ['var(--c-blue)', 'var(--c-green)', 'var(--c-red)', 'var(--c-orange)', 'var(--c-purple)'][i % 5] }} />
              {t}
            </span>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-4">
        <div className="rounded-xl border border-border bg-panel p-6 md:p-7">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[20px] font-semibold tracking-[-0.02em]">One canvas, every kind of note</h3>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">05 · Objects · rotate · undo · ⌘F</span>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {OBJECTS.map(([Icon, label]) => (
              <div key={label} className="group/o flex items-center gap-2.5 bg-panel px-4 py-3.5 text-[14px] text-foreground/85 transition-colors hover:bg-panel-2">
                <Icon size={16} className="text-muted-foreground transition-colors group-hover/o:text-[#a9b8ff]" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </Section>
  )
}
