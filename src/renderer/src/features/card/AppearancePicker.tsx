import { useState, type ReactNode } from 'react'
import { CARD_ICONS, CardIcon } from '@/components/CardIcon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PALETTE } from '@/lib/colors'
import { cn } from '@/lib/utils'

const EMOJI: [string, string][] = [
  ['💡', 'idea light bulb'], ['🚀', 'rocket launch ship'], ['🎯', 'target goal'], ['⭐', 'star favorite'], ['🔥', 'fire hot urgent'], ['⚡', 'bolt energy fast'],
  ['✅', 'done check task'], ['📌', 'pin important'], ['📝', 'note memo write'], ['📚', 'books learning read'], ['📖', 'book reading'], ['🧠', 'brain think'],
  ['💬', 'chat message talk'], ['❓', 'question'], ['❗', 'important alert'], ['⚠️', 'warning risk'], ['🐛', 'bug issue'], ['🛠️', 'tools build fix'],
  ['⚙️', 'settings gear'], ['💻', 'computer code laptop'], ['📱', 'phone mobile app'], ['🌐', 'web globe internet'], ['🔒', 'lock security private'], ['🔑', 'key access'],
  ['📈', 'growth chart up'], ['📉', 'down chart decline'], ['📊', 'chart data stats'], ['💰', 'money finance'], ['💳', 'card payment'], ['🏦', 'bank'],
  ['🗓️', 'calendar date plan'], ['⏰', 'alarm time deadline'], ['⏳', 'waiting hourglass'], ['🏁', 'finish flag milestone'], ['🏆', 'trophy win award'], ['🎉', 'party celebrate'],
  ['👥', 'people team users'], ['👤', 'person user'], ['🤝', 'deal partner handshake'], ['📣', 'announcement marketing'], ['✉️', 'email mail'], ['📞', 'call phone'],
  ['🎨', 'design art palette'], ['✏️', 'pencil edit draft'], ['🖼️', 'image picture'], ['🎬', 'video film'], ['🎵', 'music'], ['📷', 'camera photo'],
  ['🌱', 'plant growth seed'], ['🌍', 'world earth'], ['☀️', 'sun day'], ['🌙', 'moon night'], ['☕', 'coffee break'], ['🍎', 'apple food health'],
  ['❤️', 'heart love'], ['😊', 'smile happy'], ['🤔', 'thinking'], ['😅', 'sweat oops'], ['🙌', 'hands yay'], ['👀', 'eyes look review'],
  ['🧪', 'experiment test lab'], ['🔬', 'research science'], ['🧩', 'puzzle feature'], ['🗂️', 'folder archive organize'], ['📦', 'package box ship'], ['🔗', 'link']
]

export const CARD_COLORS = Object.keys(PALETTE).filter((c) => c !== 'gray')

interface Props {
  color: string | null
  icon: string | null
  onChange: (patch: { color?: string | null; icon?: string | null }) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}

/** Colour + icon (emoji or app icon) picker for cards. */
export function AppearancePicker({ color, icon, onChange, children, align = 'start' }: Props) {
  const [tab, setTab] = useState<'emoji' | 'icons'>(icon?.startsWith('icon:') ? 'icons' : 'emoji')
  const [q, setQ] = useState('')
  const emojis = EMOJI.filter(([e, k]) => !q || k.includes(q.toLowerCase()) || e === q)
  const icons = Object.keys(CARD_ICONS).filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()))

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <div className="border-b p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Color</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onChange({ color: null })}
              className={cn('grid size-6 place-items-center rounded-full border text-[10px] text-muted-foreground', !color && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-popover')}
              title="Default"
            >
              ∅
            </button>
            {CARD_COLORS.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() => onChange({ color: c })}
                className={cn('size-6 rounded-full border', color === c && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-popover')}
                style={{ background: PALETTE[c].bg, borderColor: PALETTE[c].border }}
              />
            ))}
          </div>
        </div>
        <div className="p-3">
          <div className="mb-2 flex items-center gap-1">
            {(['emoji', 'icons'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn('h-7 rounded-md px-2.5 text-xs capitalize', tab === t ? 'bg-accent font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                {t}
              </button>
            ))}
            <div className="flex-1" />
            {icon && (
              <button onClick={() => onChange({ icon: null })} className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                Remove
              </button>
            )}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'emoji' ? 'Search emoji…' : 'Search icons…'}
            className="mb-2 h-8 w-full rounded-md bg-muted/60 px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="grid max-h-52 grid-cols-8 gap-0.5 overflow-y-auto">
            {tab === 'emoji'
              ? emojis.map(([e]) => (
                  <button key={e} onClick={() => onChange({ icon: e })} className={cn('grid size-8 place-items-center rounded-md text-lg hover:bg-accent', icon === e && 'bg-accent')}>
                    {e}
                  </button>
                ))
              : icons.map((n) => (
                  <button
                    key={n}
                    title={n}
                    onClick={() => onChange({ icon: `icon:${n}` })}
                    className={cn('grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground', icon === `icon:${n}` && 'bg-accent text-foreground')}
                  >
                    <CardIcon icon={`icon:${n}`} className="size-[18px]" />
                  </button>
                ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
