import { Reveal, Section, SectionHeader } from './Frame'
import * as shots from '../shots'

const ITEMS = [
  ['Card library & ⌘K search', 'Rich-text cards with / commands, @ mentions and real backlinks — one card on any number of boards. SQLite FTS5 search.', shots.librarySearch, '48% 42%'],
  ['Tasks & kanban', 'Tags become databases: kanban boards and lists, plus a Tasks area with priority, assignee, due dates and activity.', shots.tasks, '55% 28%'],
  ['PDF reader with highlights', 'Dock a PDF next to your board in a split-screen reader and highlight as you go.', shots.pdfReader, '88% 30%']
]

export function More() {
  return (
    <Section className="px-5 py-24 md:px-8 md:py-32">
      <SectionHeader index="10" eyebrow="Also included" title="And the quiet parts you'll use daily." />
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {ITEMS.map(([title, body, img, pos], i) => (
          <Reveal key={title} delay={i * 0.08} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-panel transition-colors hover:border-border-strong">
            <div className="relative aspect-[16/10] overflow-hidden border-b border-border">
              <img src={img} alt="" loading="lazy" className="absolute inset-0 size-full scale-[1.9] object-cover transition-transform duration-700 group-hover:scale-[2]" style={{ objectPosition: pos, transformOrigin: pos }} />
            </div>
            <div className="p-6">
              <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}
