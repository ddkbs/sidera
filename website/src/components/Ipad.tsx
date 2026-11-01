import { IconGrid, IconLock, IconPencil, IconWifi } from 'obra-icons-react'
import { Kbd, Reveal, Section, SectionHeader } from './Frame'

const POINTS = [
  [IconGrid, 'Every board, one tap away', 'The iPad opens on a live overview of all your whiteboards. Pick one, edit it, switch any time — it reopens where you left off.'],
  [IconPencil, 'Write like on paper', 'Apple Pencil with palm rejection: pen, marker, laser pointer, eraser and lasso, a full colour palette, a bar you drag out of the way.'],
  [IconWifi, 'Your Wi-Fi, no cloud', 'The Mac serves your boards on your local network. No account, no App Store, no relay.'],
  [IconLock, 'End-to-end encrypted', 'XChaCha20-Poly1305 with per-connection keys from a device key handed over once by QR code.']
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
        <Reveal delay={0.1} className="relative pb-[18%]">
          <div className="pointer-events-none absolute inset-[10%] rounded-full bg-brand/25 blur-[100px]" />
          <img
            src="/shots/ipad-dark.webp"
            alt="Sidera for iPad in dark mode: a board of charts with Apple Pencil ink and the pen bar at the bottom"
            loading="lazy"
            className="relative w-full drop-shadow-[0_40px_60px_rgba(0,0,0,0.7)]"
          />
          <img
            src="/shots/ipad-boards-dark.webp"
            alt="The iPad's start screen: every whiteboard as a live preview tile, with search"
            loading="lazy"
            className="absolute bottom-0 -left-[6%] w-[58%] drop-shadow-[0_30px_50px_rgba(0,0,0,0.8)]"
          />
        </Reveal>
      </div>
    </Section>
  )
}
