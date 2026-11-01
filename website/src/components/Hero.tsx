import { motion, useScroll, useTransform } from 'motion/react'
import { IconArrowRight } from 'obra-icons-react'
import { useRef } from 'react'
import { GridPulse } from './GridPulse'
import { DownloadButton, DownloadMeta } from './DownloadButton'
import { GithubButton } from './GithubButton'
import * as shots from '../shots'

const ease = [0.22, 1, 0.36, 1] as const
const up = (delay: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease } })

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <GridPulse className="[mask-image:radial-gradient(ellipse_75%_70%_at_50%_42%,black_30%,transparent_80%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-280px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand/20 blur-[140px]" />
      <div className="relative z-10 mx-auto flex max-w-[1240px] flex-col items-center px-5 pb-16 pt-20 text-center md:pt-28">
        <motion.a {...up(0)} href="#ipad" data-grid-avoid className="group mb-8 inline-flex items-center gap-2.5 rounded-md border border-border-strong bg-panel/80 py-1 pl-1 pr-3 text-[13px] text-foreground/90 backdrop-blur transition-colors hover:border-white/25">
          <span className="rounded-[4px] bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest">New</span>
          Sidera for iPad<span className="hidden sm:inline"> — all your boards, with Apple Pencil</span>
          <IconArrowRight size={14} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </motion.a>
        <motion.h1 {...up(0.08)} data-grid-avoid className="guard text-[clamp(48px,9vw,112px)] font-semibold leading-[0.92] tracking-[-0.05em]">
          Every idea.
          <br />
          <span className="[text-shadow:none] bg-[linear-gradient(100deg,#fff_10%,#a9b8ff_45%,#7c8cff_70%,#fff_100%)] bg-clip-text text-transparent">One board.</span>
        </motion.h1>
        <motion.p {...up(0.16)} data-grid-avoid className="guard mt-7 max-w-[46ch] text-[clamp(16px,1.6vw,19px)] leading-relaxed text-muted-foreground">
          Text, tables, live charts and pen ink on one infinite canvas — on your Mac, live on your iPad, and buildable by Claude over MCP.
        </motion.p>
        <motion.div {...up(0.24)} data-grid-avoid className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <DownloadButton size="lg" />
          <GithubButton className="h-12 px-5 text-[15px]" />
        </motion.div>
        <motion.div {...up(0.32)} data-grid-avoid className="mt-5">
          <DownloadMeta />
        </motion.div>
      </div>
      <Showcase />
    </section>
  )
}

/** Callouts pinned to spots on the hero board screenshot (percent of the image). */
const CALLOUTS = [
  { x: 16, y: 26, label: 'Tables', color: 'var(--c-blue)' },
  { x: 39, y: 18, label: 'Sketches', color: 'var(--c-purple)' },
  { x: 71, y: 13, label: 'Connectors', color: 'var(--c-orange)' },
  { x: 39, y: 50, label: 'Timeline', color: 'var(--c-green)' },
  { x: 72, y: 45, label: 'Waterfall', color: 'var(--c-red)' },
  { x: 27, y: 66, label: 'Table → chart, linked', color: 'var(--c-blue)' },
  { x: 62, y: 88, label: 'Pen ink', color: 'var(--c-purple)' }
]

function Showcase() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1])
  const y = useTransform(scrollYProgress, [0, 1], [40, 0])
  return (
    <div ref={ref} className="relative z-10 mx-auto max-w-[1240px] px-3 pb-20 md:px-8 [perspective:1600px]">
      <motion.div style={{ rotateX, scale, y }} className="relative origin-top">
        <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-1/3 rounded-[40px] bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--brand)_35%,transparent),transparent_70%)] blur-2xl" />
        <div className="relative rounded-2xl border border-border-strong bg-panel p-1.5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
          <div className="flex items-center justify-between px-3 pb-2 pt-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-faint">
            <span>board / orbitra — satellite internet</span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-c-green" /> local · 127.0.0.1
            </span>
          </div>
          <div className="relative overflow-hidden rounded-[10px] border border-border">
            <img src={shots.hero} width={2400} height={1500} alt="A Sidera board about a fictional satellite-internet company: tables, eight charts, a timeline, sketches and pen ink" className="block w-full" />
            <div className="pointer-events-none absolute inset-0 hidden md:block">
              {CALLOUTS.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: '-120px' }}
                  transition={{ delay: 0.3 + i * 0.09, duration: 0.5, ease }}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-[5px] border border-white/15 bg-black/75 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/90 shadow-lg backdrop-blur-md"
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                >
                  <span className="relative flex size-1.5">
                    <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: c.color }} />
                    <span className="relative size-1.5 rounded-full" style={{ background: c.color }} />
                  </span>
                  {c.label}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
      <p className="mt-5 text-center font-mono text-xs text-faint">↳ One board: text, a table, eight charts, images, sketches and pen ink — built in Sidera.</p>
    </div>
  )
}
