import { AnimatePresence, motion, useDragControls, useMotionValue } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Eraser, Lasso, LaserPointer, Marker, PenTool, Plus } from '@/components/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { t } from '@/lib/i18n'
import { storageKey } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { DEFAULT_RECENT_COLORS, HIGHLIGHTER_WIDTHS, INK_PALETTE, PEN_WIDTHS, highlighterColor, pushRecentColor, type PenSettings, type PenTool as Tool } from './elements'
import { darkInk } from './geometry'
import { IS_IPAD } from '@/lib/platform'

const widthName = (i: number): string => t(i === 0 ? 'ink.width.fine' : i === 1 ? 'ink.width.medium' : 'ink.width.bold')
const POS_KEY = 'sidera.penbar'

interface Props {
  settings: PenSettings
  onChange: (s: PenSettings) => void
  dark: boolean
}

const TOOLS: { id: Tool; label: () => string; icon: ReactNode }[] = [
  { id: 'pen', label: () => t('ink.pen'), icon: <PenTool /> },
  { id: 'highlighter', label: () => t('ink.marker'), icon: <Marker /> },
  { id: 'laser', label: () => t('ink.laser'), icon: <LaserPointer /> },
  { id: 'eraser', label: () => t('ink.eraser'), icon: <Eraser /> },
  { id: 'lasso', label: () => t('ink.lasso'), icon: <Lasso /> }
]

/**
 * Floating pen bar: pen / marker / laser / eraser / lasso, then only what the tool uses — recent colours with the full palette
 * behind "+", widths, dashes. Dragged anywhere by its grip (position remembered); on the Mac a short hint on entry.
 */
export function PenPalette({ settings, onChange, dark }: Props) {
  const [hint, setHint] = useState(!IS_IPAD)
  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 3500)
    return () => clearTimeout(timer)
  }, [])
  const set = (patch: Partial<PenSettings>): void => onChange({ ...settings, ...patch })
  const swatch = (c: string): string => (dark ? (darkInk(c) ?? c) : c)
  const tool = settings.tool
  const recent = settings.recent?.length ? settings.recent : [...DEFAULT_RECENT_COLORS]
  const shown = (c: string): string => swatch(tool === 'highlighter' ? highlighterColor(c) : c)
  const pickColor = (c: string): void => set({ color: c, recent: pushRecentColor(recent, c), tool: tool === 'eraser' ? 'pen' : tool })
  const widths = tool === 'highlighter' ? HIGHLIGHTER_WIDTHS : PEN_WIDTHS
  const btn = IS_IPAD ? 'size-10' : 'size-8'

  // dragging by the grip; the offset from the default spot (bottom centre) is remembered
  const area = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const saved = loadPos()
  const x = useMotionValue(saved.x)
  const y = useMotionValue(saved.y)
  const savePos = (): void => {
    try {
      localStorage.setItem(storageKey(POS_KEY), JSON.stringify({ x: x.get(), y: y.get() }))
    } catch {
      /* ignore */
    }
  }
  // a smaller window / rotated iPad must not leave the bar off screen
  useEffect(() => {
    const clamp = (): void => {
      const a = area.current
      if (!a) return
      const maxX = Math.max(0, a.clientWidth / 2 - 120)
      x.set(Math.max(-maxX, Math.min(maxX, x.get())))
      y.set(Math.max(-(a.clientHeight - 80), Math.min(0, y.get())))
    }
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [x, y])

  return (
    <div ref={area} data-pen-ui className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-end gap-2 pb-2">
      <AnimatePresence>
        {hint && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-foreground/80 px-3 py-1 text-xs text-background shadow-sm">
            {t('ink.hint')}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        drag
        dragControls={drag}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={area}
        onDragEnd={savePos}
        style={{ x, y }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="pen-bar pointer-events-auto relative flex items-center gap-1 rounded-[18px] border border-foreground/10 bg-popover/90 p-1.5 shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_18px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      >
        <button
          type="button"
          aria-label={t('ink.moveBar')}
          title={t('ink.moveBar')}
          onPointerDown={(e) => drag.start(e)}
          className={cn('grid shrink-0 cursor-grab touch-none place-items-center rounded-xl text-muted-foreground/70 active:cursor-grabbing', IS_IPAD ? 'h-10 w-6' : 'h-8 w-5')}
        >
          <span className="grid grid-cols-2 gap-[3px]">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="size-[3px] rounded-full bg-current" />
            ))}
          </span>
        </button>

        <div className="flex items-center gap-0.5 rounded-[14px] bg-foreground/[0.04] p-0.5">
          {TOOLS.map((tl) => {
            const active = tool === tl.id
            return (
              <button
                key={tl.id}
                type="button"
                aria-label={tl.label()}
                title={tl.label()}
                aria-pressed={active}
                onClick={() => set({ tool: tl.id })}
                className={cn(
                  'relative grid place-items-center rounded-xl text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-[19px]',
                  btn,
                  active && 'bg-background text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-foreground/10 hover:text-foreground'
                )}
              >
                {tl.icon}
                {active && <span className="absolute bottom-[3px] size-1 rounded-full bg-brand shadow-[0_0_6px_var(--brand)]" />}
              </button>
            )
          })}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {tool === 'eraser' || tool === 'laser' || tool === 'lasso' ? (
            <motion.span
              key={`hint-${tool}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="px-2 font-mono text-[10.5px] uppercase tracking-[0.12em] whitespace-nowrap text-muted-foreground"
            >
              {tool === 'eraser' ? t('ink.eraserHint') : tool === 'laser' ? t('ink.laserHint') : t('ink.lassoHint')}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {tool !== 'eraser' && tool !== 'lasso' && (
          <>
            <Divider />
            <div className="flex items-center gap-0.5">
              {recent.map((c) => (
                <Swatch key={c} color={shown(c)} label={c} active={settings.color.toLowerCase() === c.toLowerCase()} size={btn} onClick={() => pickColor(c)} />
              ))}
              <MoreColors current={settings.color} swatch={shown} onPick={pickColor} size={btn} />
            </div>
          </>
        )}

        {(tool === 'pen' || tool === 'highlighter') && (
          <>
            <Divider />
            <div className="flex items-center gap-0.5">
              {widths.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  aria-label={widthName(i)}
                  title={widthName(i)}
                  aria-pressed={settings.width === i}
                  onClick={() => set({ width: i })}
                  className={cn('grid place-items-center rounded-xl transition-colors hover:bg-foreground/[0.06]', btn, settings.width === i && 'bg-foreground/[0.08]')}
                >
                  <span
                    className={cn('rounded-full', tool === 'highlighter' && 'opacity-60')}
                    style={{ width: 4 + i * 4, height: 4 + i * 4, background: shown(settings.color) }}
                  />
                </button>
              ))}
              {tool === 'pen' && (
                <button
                  type="button"
                  aria-label={t('ink.dashed')}
                  title={t('ink.dashed')}
                  aria-pressed={!!settings.dashed}
                  onClick={() => set({ dashed: !settings.dashed })}
                  className={cn('grid place-items-center rounded-xl text-foreground transition-colors hover:bg-foreground/[0.06]', btn, settings.dashed && 'bg-foreground/[0.08]')}
                >
                  <span className="w-5 border-t-[2.5px] border-dashed border-current" />
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

function loadPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(storageKey(POS_KEY)) ?? 'null') as { x: number; y: number } | null
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0 }
}

const Divider = () => <div className="mx-0.5 h-6 w-px shrink-0 bg-foreground/10" />

function Swatch({ color, label, active, size, onClick }: { color: string; label: string; active: boolean; size: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} aria-pressed={active} onClick={onClick} className={cn('grid place-items-center rounded-xl', size)}>
      <span
        className={cn('size-5 rounded-full ring-1 ring-black/10 transition-transform dark:ring-white/15', active && 'scale-110 ring-2 ring-offset-2 ring-offset-popover')}
        style={{ background: color, ...(active ? { ['--tw-ring-color' as string]: color } : {}) }}
      />
    </button>
  )
}

/** "+": the whole palette, plus the system colour picker for anything else. */
function MoreColors({ current, swatch, onPick, size }: { current: string; swatch: (c: string) => string; onPick: (c: string) => void; size: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('ink.moreColors')}
          title={t('ink.moreColors')}
          className={cn('grid place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground data-[state=open]:bg-foreground/[0.08]', size)}
        >
          <span className="grid size-5 place-items-center rounded-full bg-[conic-gradient(#e03131,#f08c00,#fab005,#2f9e44,#1098ad,#1971c2,#7950f2,#c2255c,#e03131)] p-[3px]">
            <span className="grid size-full place-items-center rounded-full bg-popover">
              <Plus className="size-2.5" />
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent data-pen-ui side="top" sideOffset={12} className="w-auto rounded-2xl border-foreground/10 bg-popover/95 p-3 backdrop-blur-xl">
        <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('ink.moreColors')}</div>
        <div className="grid grid-cols-6 gap-1.5">
          {INK_PALETTE.map((c) => {
            const active = current.toLowerCase() === c.toLowerCase()
            return (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={active}
                onClick={() => {
                  onPick(c)
                  setOpen(false)
                }}
                className={cn('size-8 rounded-full ring-1 ring-black/10 transition-transform active:scale-90 dark:ring-white/15', active && 'ring-2 ring-brand ring-offset-2 ring-offset-popover')}
                style={{ background: swatch(c) }}
              />
            )
          })}
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-foreground/15 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground">
          <span className="size-4 rounded-full bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)]" />
          {t('ink.customColor')}
          <input type="color" className="sr-only" value={/^#[0-9a-f]{6}$/i.test(current) ? current : '#1e1e1e'} onChange={(e) => onPick(e.target.value)} />
        </label>
      </PopoverContent>
    </Popover>
  )
}
