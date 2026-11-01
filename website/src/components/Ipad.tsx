import { IconLock, IconPencil, IconWifi } from 'obra-icons-react'
import { Kbd, Reveal, Section, SectionHeader } from './Frame'

const POINTS = [
  [IconWifi, 'Your Wi-Fi, no cloud', 'The Mac serves the board on your local network. No account, no App Store, no relay.'],
  [IconLock, 'End-to-end encrypted', 'XChaCha20-Poly1305 with per-connection keys from a device key handed over once by QR code.'],
  [IconPencil, 'Pencil draws, finger pans', 'Edit text, tables and shapes; drop in photos. Changes flow both ways in real time.']
] as const

export function Ipad() {
  return (
    <Section id="ipad" className="overflow-hidden px-5 py-24 md:px-8 md:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <SectionHeader index="08" eyebrow="Sidera for iPad" title="Your boards, live on the iPad.">
            Switch on the iPad connection once (<Kbd>⇧</Kbd> <Kbd>⌘</Kbd> <Kbd>D</Kbd>), pair with a QR code, add it to the home screen — then open any of your whiteboards on the iPad.
          </SectionHeader>
          <div className="mt-10 flex flex-col">
            {POINTS.map(([Icon, title, body], i) => (
              <Reveal key={title} delay={i * 0.08} className="relative flex gap-4 py-5">
                <div className="dash-x absolute inset-x-0 top-0 h-px" />
                <div className="grid size-9 shrink-0 place-items-center rounded-md border border-border-strong bg-panel text-[#a9b8ff]">
                  <Icon size={17} />
                </div>
                <div>
                  <div className="text-[15.5px] font-medium">{title}</div>
                  <div className="mt-1 text-[14.5px] leading-relaxed text-muted-foreground">{body}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal delay={0.1} className="relative">
          <div className="pointer-events-none absolute inset-[10%] rounded-full bg-brand/25 blur-[100px]" />
          <img src="/shots/ipad-dark.webp" alt="Sidera for iPad in dark mode showing the board's charts, with the pen palette at the bottom" loading="lazy" className="relative w-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.7)]" />
        </Reveal>
      </div>
    </Section>
  )
}
