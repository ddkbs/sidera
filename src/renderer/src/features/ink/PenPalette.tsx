import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Eraser, Highlighter, PenTool } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { labelMap, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { INK_COLORS, PEN_WIDTHS, highlighterColor, type PenSettings, type PenTool as Tool } from './elements'
import { darkInk } from './geometry'
import { IS_IPAD } from '@/lib/platform'

const INK_NAME = labelMap({ Ink: 'ink.color.ink', Blue: 'color.blue', Red: 'color.red', Green: 'color.green', Orange: 'color.orange', Purple: 'color.purple' })
const inkName = (name: string): string => INK_NAME[name as keyof typeof INK_NAME] ?? name
const widthName = (i: number): string => t(i === 0 ? 'ink.width.fine' : i === 1 ? 'ink.width.medium' : 'ink.width.bold')

interface Props {
  settings: PenSettings
  onChange: (s: PenSettings) => void
  dark: boolean
}

/** Floating palette of pen mode: pen / highlighter / eraser, six colours, three widths — plus a short hint on entry. */
export function PenPalette({ settings, onChange, dark }: Props) {
  // the "P / Esc" hint is about the Mac's pen mode; on the iPad the palette is always there for the Pencil
  const [hint, setHint] = useState(!IS_IPAD)
  useEffect(() => {
    const timer = setTimeout(() => setHint(false), 3500)
    return () => clearTimeout(timer)
  }, [])
  const set = (patch: Partial<PenSettings>): void => onChange({ ...settings, ...patch })
  const swatch = (c: string): string => (dark ? (darkInk(c) ?? c) : c)
  const erasing = settings.tool === 'eraser'

  return (
    <div data-pen-ui className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-2">
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-full bg-foreground/80 px-3 py-1 text-xs text-background shadow-sm"
          >
            {t('ink.hint')}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="pointer-events-auto flex items-center gap-1 rounded-2xl border bg-popover/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.18)] backdrop-blur"
      >
        <ToolButton tool="pen" label={t('ink.pen')} active={settings.tool === 'pen'} onClick={() => set({ tool: 'pen' })}>
          <PenTool />
        </ToolButton>
        <ToolButton tool="highlighter" label={t('ink.highlighter')} active={settings.tool === 'highlighter'} onClick={() => set({ tool: 'highlighter' })}>
          <Highlighter />
        </ToolButton>
        <ToolButton tool="eraser" label={t('ink.eraser')} active={erasing} onClick={() => set({ tool: 'eraser' })}>
          <Eraser />
        </ToolButton>
        <div className="mx-1 h-6 w-px bg-border" />
        <div className={cn('flex items-center gap-0.5 transition-opacity', erasing && 'opacity-40')}>
          {INK_COLORS.map((c) => {
            const shown = settings.tool === 'highlighter' ? highlighterColor(c.value) : c.value
            return (
              <Tooltip key={c.value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={inkName(c.name)}
                    aria-pressed={settings.color === c.value}
                    onClick={() => set({ color: c.value, tool: erasing ? 'pen' : settings.tool })}
                    className={cn(
                      'grid size-8 place-items-center rounded-xl transition hover:bg-accent',
                      settings.color === c.value && 'bg-accent'
                    )}
                  >
                    <span
                      className={cn('size-4 rounded-full ring-1 ring-black/10 dark:ring-white/15', settings.color === c.value && 'ring-2 ring-brand/70')}
                      style={{ background: swatch(shown) }}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{inkName(c.name)}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="mx-1 h-6 w-px bg-border" />
        <div className={cn('flex items-center gap-0.5 transition-opacity', settings.tool !== 'pen' && 'opacity-40')}>
          {PEN_WIDTHS.map((w, i) => (
            <Tooltip key={w}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={widthName(i)}
                  aria-pressed={settings.width === i}
                  onClick={() => set({ width: i, tool: 'pen' })}
                  className={cn('grid size-8 place-items-center rounded-xl text-foreground transition hover:bg-accent', settings.width === i && 'bg-accent')}
                >
                  <span className="rounded-full bg-current" style={{ width: 3 + i * 3.5, height: 3 + i * 3.5 }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{widthName(i)}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('ink.dashed')}
                aria-pressed={!!settings.dashed}
                onClick={() => set({ dashed: !settings.dashed, tool: 'pen' })}
                className={cn('grid size-8 place-items-center rounded-xl text-foreground transition hover:bg-accent', settings.dashed && 'bg-accent')}
              >
                <span className="w-5 border-t-[2.5px] border-dashed border-current" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('ink.dashed')}</TooltipContent>
          </Tooltip>
        </div>
      </motion.div>
    </div>
  )
}

function ToolButton({ label, active, onClick, children }: { tool: Tool; label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'grid size-8 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground [&_svg]:size-[18px]',
            active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
